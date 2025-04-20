import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, Timestamp, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import TaskList from './GanttChart/TaskList';
import GanttVisualization from './GanttChart/GanttVisualization';
import './GanttChart/GanttChart.css';

// 初始化 Firebase Functions
const functions = getFunctions();

/**
 * Gantt Chart component for visualizing tasks on a timeline
 * @param {string} teamId - ID of the team
 * @param {number} refreshKey - Key to trigger refresh when changed
 */
const GanttChart = ({ teamId, refreshKey = 0 }) => {
  // 状态管理
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [teamData, setTeamData] = useState(null);
  const [timeScale, setTimeScale] = useState('month'); // 'day', 'week', 'month'
  const [currentDate, setCurrentDate] = useState(new Date());
  const [dateRange, setDateRange] = useState({ start: null, end: null });
  const [draggingTask, setDraggingTask] = useState(null);
  const [draggingPosition, setDraggingPosition] = useState({ x: 0, y: 0 });
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [userRole, setUserRole] = useState(null); // 用于权限检查
  const [scrollPosition, setScrollPosition] = useState(0);
  
  // 对任务数据进行排序的状态
  const [sortField, setSortField] = useState('start_date');
  const [sortDirection, setSortDirection] = useState('asc');
  
  // 用于筛选任务的状态
  const [filterOptions, setFilterOptions] = useState({
    status: 'all',
    priority: 'all',
    assignee: 'all'
  });
  
  // DOM引用
  const ganttContainerRef = useRef(null);
  
  // 加载团队数据和任务
  useEffect(() => {
    const loadTeamData = async () => {
      if (!teamId) {
        setError('No team ID provided');
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        
        // 获取团队数据
        const teamRef = doc(db, 'teams', teamId);
        const teamSnap = await getDoc(teamRef);
        
        if (teamSnap.exists()) {
          const team = {
            id: teamId,
            ...teamSnap.data()
          };
          
          setTeamData(team);
          
          // 获取团队成员数据
          if (team.membersData && Array.isArray(team.membersData)) {
            setTeamMembers(team.membersData);
          }
          
          // 获取用户在团队中的角色
          const userId = auth.currentUser?.uid;
          if (userId && team.membersData) {
            const memberData = team.membersData.find(m => m.uid === userId);
            if (memberData) {
              setUserRole(memberData.role);
            }
          }
          
          // 处理任务数据
          if (team.tasks && Array.isArray(team.tasks)) {
            // 预处理任务数据
            const processedTasks = team.tasks.map(task => ({
              ...task,
              // 确保所有任务都有一个唯一ID
              id: task.id || Date.now().toString() + Math.random().toString(36).substr(2, 9),
              // 确保开始日期格式正确
              start_date: task.start_date || Timestamp.fromDate(new Date()),
              // 确保持续时间有默认值
              duration: task.duration || 1,
              // 确保任务有默认进度
              progress: task.progress || 0,
              // 确保任务有默认状态
              status: task.status || 'notStarted'
            }));
            
            setTasks(processedTasks);
            
            // 根据任务数据计算日期范围
            calculateDateRange(processedTasks);
          } else {
            setTasks([]);
            // 设置默认日期范围为当前月
            setDefaultDateRange();
          }
        } else {
          setError('Team not found');
          setTasks([]);
          setDefaultDateRange();
        }
      } catch (err) {
        console.error('Error loading team data:', err);
        setError(`Error loading data: ${err.message}`);
        setTasks([]);
        setDefaultDateRange();
      } finally {
        setLoading(false);
      }
    };
    
    loadTeamData();
  }, [teamId, refreshKey]);
  
  // 设置默认日期范围（当前月）
  const setDefaultDateRange = () => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    
    // 添加前后的缓冲时间
    start.setDate(start.getDate() - 7);
    end.setDate(end.getDate() + 7);
    
    setDateRange({ start, end });
  };
  
  // 根据任务计算合适的日期范围
  const calculateDateRange = (taskList) => {
    if (!taskList || taskList.length === 0) {
      setDefaultDateRange();
      return;
    }
    
    // 找出最早和最晚的任务日期
    let earliest = new Date();
    let latest = new Date();
    
    taskList.forEach(task => {
      let taskStart = getDateFromTimestamp(task.start_date);
      
      // 计算任务结束日期
      const duration = task.duration || 1;
      const taskEnd = new Date(taskStart);
      taskEnd.setDate(taskStart.getDate() + duration);
      
      // 更新最早和最晚日期范围
      if (taskStart < earliest) earliest = taskStart;
      if (taskEnd > latest) latest = taskEnd;
    });
    
    // 添加前后的缓冲时间
    earliest.setDate(earliest.getDate() - 14);
    latest.setDate(latest.getDate() + 14);
    
    setDateRange({ start: earliest, end: latest });
  };
  
  // 从Firestore时间戳获取JavaScript日期对象
  const getDateFromTimestamp = (timestamp) => {
    if (!timestamp) return new Date();
    
    if (typeof timestamp.toDate === 'function') {
      return timestamp.toDate();
    } else if (timestamp._seconds) {
      return new Date(timestamp._seconds * 1000);
    } else if (timestamp instanceof Date) {
      return timestamp;
    } else {
      return new Date(timestamp);
    }
  };
  
  // 应用排序
  const sortTasks = (tasksToSort) => {
    return [...tasksToSort].sort((a, b) => {
      let valueA, valueB;
      
      // 根据排序字段获取值
      if (sortField === 'start_date') {
        valueA = getDateFromTimestamp(a.start_date).getTime();
        valueB = getDateFromTimestamp(b.start_date).getTime();
      } else if (sortField === 'duration') {
        valueA = parseInt(a.duration) || 0;
        valueB = parseInt(b.duration) || 0;
      } else if (sortField === 'progress') {
        valueA = parseInt(a.progress) || 0;
        valueB = parseInt(b.progress) || 0;
      } else if (sortField === 'priority') {
        const priorityOrder = { low: 1, medium: 2, high: 3 };
        valueA = priorityOrder[a.priority] || 0;
        valueB = priorityOrder[b.priority] || 0;
      } else {
        valueA = a[sortField] || '';
        valueB = b[sortField] || '';
      }
      
      // 执行排序
      if (sortDirection === 'asc') {
        return valueA > valueB ? 1 : -1;
      } else {
        return valueA < valueB ? 1 : -1;
      }
    });
  };
  
  // 应用筛选
  const filterTasks = (tasksToFilter) => {
    return tasksToFilter.filter(task => {
      // 按状态筛选
      if (filterOptions.status !== 'all' && task.status !== filterOptions.status) {
        return false;
      }
      
      // 按优先级筛选
      if (filterOptions.priority !== 'all' && task.priority !== filterOptions.priority) {
        return false;
      }
      
      // 按负责人筛选
      if (filterOptions.assignee !== 'all') {
        const hasAssignee = task.assignees && task.assignees.some(a => a.uid === filterOptions.assignee);
        if (!hasAssignee) return false;
      }
      
      return true;
    });
  };
  
  // 检查当前用户是否是任务负责人
  const isTaskAssignee = (task) => {
    if (!task || !auth.currentUser) return false;
    
    return task.assignees && 
           task.assignees.some(assignee => assignee.uid === auth.currentUser.uid);
  };
  
  // 获取排序和筛选后的任务列表
  const getProcessedTasks = () => {
    const filteredTasks = filterTasks(tasks);
    return sortTasks(filteredTasks);
  };
  
  // 更新任务日期（在拖拽后）
  const updateTaskDate = async (taskId, newStartDate) => {
    // 查找要更新的任务
    const taskToUpdate = tasks.find(task => task.id === taskId);
    if (!taskToUpdate) {
      console.error('Task not found');
      return false;
    }
    
    // 检查权限 - 只有任务负责人可以更新任务日期，无论其角色是什么
    if (!isTaskAssignee(taskToUpdate)) {
      alert('Only task assignees can update task dates.');
      return false;
    }
    
    // 允许更新：任务负责人可以更改任务日期，无论他们是否是管理员或经理
    
    try {
      // 格式化日期
      const formattedDate = newStartDate instanceof Date 
        ? newStartDate.toISOString() 
        : new Date(newStartDate).toISOString();
      
      // 使用云函数更新任务
      const updateTaskFunction = httpsCallable(functions, 'updateTask');
      const result = await updateTaskFunction({
        teamId: teamId,
        taskId: taskId,
        taskData: {
          start_date: formattedDate
        }
      });
      
      console.log('Task updated successfully:', result.data);
      
      // 更新本地状态
      const updatedTasks = tasks.map(task => {
        if (task.id === taskId) {
          return {
            ...task,
            start_date: Timestamp.fromDate(newStartDate)
          };
        }
        return task;
      });
      
      setTasks(updatedTasks);
      
      return true;
    } catch (error) {
      console.error('Error updating task date:', error);
      alert('Failed to update task date. Please try again.');
      return false;
    }
  };
  
  // 处理任务点击事件
  const handleTaskClick = (task) => {
    setSelectedTask(task);
    setShowTaskModal(true);
  };
  
  // 更改时间尺度（日/周/月）
  const changeTimeScale = (scale) => {
    setTimeScale(scale);
  };
  
  // 导航到今天
  const goToToday = () => {
    const today = new Date();
    setCurrentDate(today);
    
    // 根据当前时间尺度调整日期范围
    if (timeScale === 'day') {
      const start = new Date(today);
      const end = new Date(today);
      end.setDate(end.getDate() + 1);
      setDateRange({ start, end });
    } else if (timeScale === 'week') {
      const start = new Date(today);
      start.setDate(today.getDate() - today.getDay()); // 本周周日
      const end = new Date(start);
      end.setDate(start.getDate() + 7); // 下周周日
      setDateRange({ start, end });
    } else { // month
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      setDateRange({ start, end });
    }
  };
  
  // 切换排序方向
  const toggleSortDirection = () => {
    setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
  };
  
  // 更改排序字段
  const changeSortField = (field) => {
    if (sortField === field) {
      toggleSortDirection();
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };
  
  // 更新筛选选项
  const updateFilterOption = (option, value) => {
    setFilterOptions({
      ...filterOptions,
      [option]: value
    });
  };
  
  // 清除所有筛选
  const clearFilters = () => {
    setFilterOptions({
      status: 'all',
      priority: 'all',
      assignee: 'all'
    });
  };
  
  // 处理滚动同步
  const handleScroll = (position) => {
    setScrollPosition(position);
  };
  
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded m-4">
        <p>{error}</p>
      </div>
    );
  }
  
  // 获取处理过的任务数据
  const processedTasks = getProcessedTasks();
  
  return (
    <div className="gantt-chart-container bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
      <div className="p-4">
        <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-4">
          {teamData?.name} - Gantt Chart
        </h2>
        
        {/* 控制栏 */}
        <div className="flex flex-wrap justify-between items-center border-b border-gray-200 dark:border-gray-700 pb-4 mb-4">
          {/* 时间尺度切换 */}
          <div className="flex space-x-1 bg-gray-200 dark:bg-gray-700 rounded-md p-1 mb-2 sm:mb-0">
            <button
              onClick={() => changeTimeScale('day')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md ${
                timeScale === 'day' 
                  ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow' 
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Day
            </button>
            <button
              onClick={() => changeTimeScale('week')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md ${
                timeScale === 'week' 
                  ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow' 
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Week
            </button>
            <button
              onClick={() => changeTimeScale('month')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md ${
                timeScale === 'month' 
                  ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow' 
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Month
            </button>
          </div>
          
          {/* 导航控制 */}
          <div className="flex items-center space-x-2">
            <button
              onClick={goToToday}
              className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-md text-sm font-medium"
            >
              Today
            </button>
          </div>
        </div>
        
        {/* 任务统计 */}
        <div className="flex flex-wrap gap-4 mb-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-md">
            <div className="text-xs text-blue-500 dark:text-blue-400">Total Tasks</div>
            <div className="text-lg font-semibold text-blue-600 dark:text-blue-300">{tasks.length}</div>
          </div>
          
          <div className="bg-green-50 dark:bg-green-900/20 px-3 py-2 rounded-md">
            <div className="text-xs text-green-500 dark:text-green-400">Completed</div>
            <div className="text-lg font-semibold text-green-600 dark:text-green-300">
              {tasks.filter(t => t.status === 'completed').length}
            </div>
          </div>
          
          <div className="bg-yellow-50 dark:bg-yellow-900/20 px-3 py-2 rounded-md">
            <div className="text-xs text-yellow-500 dark:text-yellow-400">In Progress</div>
            <div className="text-lg font-semibold text-yellow-600 dark:text-yellow-300">
              {tasks.filter(t => t.status === 'in-progress').length}
            </div>
          </div>
          
          <div className="bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-md">
            <div className="text-xs text-red-500 dark:text-red-400">Not Started</div>
            <div className="text-lg font-semibold text-red-600 dark:text-red-300">
              {tasks.filter(t => t.status === 'notStarted').length}
            </div>
          </div>
        </div>
        
        {/* 筛选工具栏 */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          {/* 状态筛选 */}
          <div className="flex items-center">
            <label htmlFor="status-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mr-2">
              Status:
            </label>
            <select
              id="status-filter"
              value={filterOptions.status}
              onChange={(e) => updateFilterOption('status', e.target.value)}
              className="rounded-md border-gray-300 shadow-sm focus:border-emerald-300 focus:ring focus:ring-emerald-200 focus:ring-opacity-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
            >
              <option value="all">All</option>
              <option value="notStarted">Not Started</option>
              <option value="in-progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="on-hold">On Hold</option>
            </select>
          </div>
          
          {/* 优先级筛选 */}
          <div className="flex items-center">
            <label htmlFor="priority-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mr-2">
              Priority:
            </label>
            <select
              id="priority-filter"
              value={filterOptions.priority}
              onChange={(e) => updateFilterOption('priority', e.target.value)}
              className="rounded-md border-gray-300 shadow-sm focus:border-emerald-300 focus:ring focus:ring-emerald-200 focus:ring-opacity-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
            >
              <option value="all">All</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          
          {/* 负责人筛选 */}
          <div className="flex items-center">
            <label htmlFor="assignee-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mr-2">
              Assignee:
            </label>
            <select
              id="assignee-filter"
              value={filterOptions.assignee}
              onChange={(e) => updateFilterOption('assignee', e.target.value)}
              className="rounded-md border-gray-300 shadow-sm focus:border-emerald-300 focus:ring focus:ring-emerald-200 focus:ring-opacity-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
            >
              <option value="all">All</option>
              {teamMembers.map(member => (
                <option key={member.uid} value={member.uid}>
                  {member.displayName || member.email}
                </option>
              ))}
            </select>
          </div>
          
          {/* 清除筛选按钮 */}
          <button
            onClick={clearFilters}
            className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            Clear Filters
          </button>
        </div>
      </div>
      
      {/* 甘特图主视图 */}
      <div className="gantt-main-view" ref={ganttContainerRef}>
        {/* 任务列表 */}
        <TaskList 
          tasks={processedTasks} 
          onTaskClick={handleTaskClick} 
          scrollPosition={scrollPosition}
          onScroll={handleScroll}
        />
        
        {/* 甘特图可视化 */}
        <GanttVisualization 
          tasks={processedTasks}
          dateRange={dateRange}
          timeScale={timeScale}
          onTaskClick={handleTaskClick}
          onTaskDrag={updateTaskDate}
        />
      </div>
      
      {/* 任务详情模态框 */}
      {showTaskModal && selectedTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full">
            <h3 className="text-xl font-bold mb-4 dark:text-white">{selectedTask.text || selectedTask.title}</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Status</p>
                <p className="font-medium dark:text-white">{selectedTask.status || 'Not set'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Priority</p>
                <p className="font-medium dark:text-white">{selectedTask.priority || 'Not set'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Start Date</p>
                <p className="font-medium dark:text-white">
                  {getDateFromTimestamp(selectedTask.start_date).toLocaleDateString()}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Duration</p>
                <p className="font-medium dark:text-white">{selectedTask.duration || 1} days</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Progress</p>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mt-2">
                  <div 
                    className="bg-emerald-500 h-2.5 rounded-full"
                    style={{ width: `${selectedTask.progress || 0}%` }}
                  ></div>
                </div>
                <p className="text-xs text-right mt-1 text-gray-600 dark:text-gray-400">
                  {selectedTask.progress || 0}%
                </p>
              </div>
            </div>
            
            {selectedTask.description && (
              <div className="mb-4">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Description</p>
                <p className="dark:text-white">{selectedTask.description}</p>
              </div>
            )}
            
            {/* 关闭按钮 */}
            <div className="flex justify-end mt-4">
              <button
                onClick={() => setShowTaskModal(false)}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-md text-gray-700 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GanttChart;
