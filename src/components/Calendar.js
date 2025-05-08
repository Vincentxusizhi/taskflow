import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import Header from './Header';
import { logInfo, logError, logWarn } from '../utils/logger';

const Calendar = () => {
 
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState(null);
  const [userTeams, setUserTeams] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState('all');
  const [viewMode, setViewMode] = useState('month'); // 'month', 'week', 'day'
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [showOnlyMyTasks, setShowOnlyMyTasks] = useState(false); 
  
  // get user and team data
  useEffect(() => {
    const fetchUserData = async () => {
      if (!auth.currentUser) return;
      
      try {
        setLoading(true);
        const userId = auth.currentUser.uid;
        
        // get user data
        const userRef = doc(db, 'users', userId);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
          const userData = {
            uid: userId,
            ...userSnap.data()
          };
          setUserData(userData);
          
          // get team
          const teamsQuery = query(
            collection(db, 'teams'),
            where('members', 'array-contains', userId)
          );
          
          const teamsSnap = await getDocs(teamsQuery);
          const teamsData = [];
          
          teamsSnap.forEach(doc => {
            teamsData.push({
              id: doc.id,
              ...doc.data()
            });
          });
          
          setUserTeams(teamsData);
          
          // get all task
          await fetchAllTeamTasks(teamsData);
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
        logError("Error fetching user data:",{errormessage: error})
      } finally {
        setLoading(false);
      }
    };
    
    fetchUserData();
  }, []);
  
  // fetch all tasks
  const fetchAllTeamTasks = async (teams) => {
    if (!teams || teams.length === 0) return;
    
    try {
      const allTasks = [];
      
      for (const team of teams) {
        const teamRef = doc(db, 'teams', team.id);
        const teamSnap = await getDoc(teamRef);
        
        if (teamSnap.exists()) {
          const teamData = teamSnap.data();
          
          if (teamData.tasks && Array.isArray(teamData.tasks)) {
            // add team info
            const tasksWithTeamInfo = teamData.tasks.map(task => ({
              ...task,
              teamId: team.id,
              teamName: team.name,
              teamColor: team.color || getRandomColor(team.id)
            }));
            
            allTasks.push(...tasksWithTeamInfo);
          }
        }
      }
      
      setTasks(allTasks);
    } catch (error) {
      console.error('Error fetching team tasks:', error);
    }
  };
  
  // get random color
  const getRandomColor = (teamId) => {
    const colors = [
      '#10B981', 
      '#3B82F6', 
      '#EC4899', 
      '#F59E0B', 
      '#EF4444', 
      '#06B6D4', 
      '#6366F1'  
    ];
    
    
    const index = teamId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
    return colors[index];
  };
  
  // check task assigned
  const isTaskAssignedToMe = (task) => {
    if (!userData || !userData.uid) return false;
    if (!task.assignees || !Array.isArray(task.assignees)) return false;
    
    return task.assignees.some(assignee => 
      (typeof assignee === 'string' && assignee === userData.uid) || 
      (assignee && assignee.uid === userData.uid)
    );
  };
  
  // filter task
  const filteredTasks = tasks
    // base on team
    .filter(task => selectedTeam === 'all' || task.teamId === selectedTeam)
    // based on assignee
    .filter(task => !showOnlyMyTasks || isTaskAssignedToMe(task));
  
  // handle task filter
  const toggleMyTasksFilter = () => {
    setShowOnlyMyTasks(!showOnlyMyTasks);
  };
  
  // get date range
  const getDateRange = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    if (viewMode === 'month') {
      // get first day
      const firstDay = new Date(year, month, 1);
      // get last day
      const lastDay = new Date(year, month + 1, 0);
      
      // adjust to full week
      const firstDayOfWeek = firstDay.getDay(); 
      const start = new Date(firstDay);
      start.setDate(firstDay.getDate() - firstDayOfWeek);
      
      const lastDayOfWeek = lastDay.getDay();
      const end = new Date(lastDay);
      end.setDate(lastDay.getDate() + (6 - lastDayOfWeek));
      
      return { start, end };
    } else if (viewMode === 'week') {
      
      const dayOfWeek = currentDate.getDay();
      const start = new Date(currentDate);
      start.setDate(currentDate.getDate() - dayOfWeek);
      
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      
      return { start, end };
    } else { 
      const start = new Date(currentDate);
      const end = new Date(currentDate);
      return { start, end };
    }
  };
  
  // generate dates
  const generateDates = () => {
    const { start, end } = getDateRange();
    const dates = [];
    const current = new Date(start);
    
    while (current <= end) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    
    return dates;
  };
  
  // get weeks in month
  const getWeeksInMonth = (dates) => {
    if (!dates.length) return 0;
    
    return Math.ceil(dates.length / 7);
  };
  
  // format datea
  const formatDate = (date, format = 'short') => {
    if (format === 'full') {
      return date.toLocaleDateString(undefined, { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    } else if (format === 'medium') {
      return date.toLocaleDateString(undefined, { 
        month: 'short', 
        day: 'numeric' 
      });
    } else if (format === 'time') {
      return date.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit'
      });
    } else {
      return date.getDate().toString();
    }
  };
  
  // navigate previous
  const navigatePrevious = () => {
    const newDate = new Date(currentDate);
    
    if (viewMode === 'month') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() - 7);
    } else {
      newDate.setDate(newDate.getDate() - 1);
    }
    
    setCurrentDate(newDate);
  };
  
  // navigate next
  const navigateNext = () => {
    const newDate = new Date(currentDate);
    
    if (viewMode === 'month') {
      newDate.setMonth(newDate.getMonth() + 1);
    } else if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() + 7);
    } else {
      newDate.setDate(newDate.getDate() + 1);
    }
    
    setCurrentDate(newDate);
  };
  
  // go ttoday
  const goToToday = () => {
    setCurrentDate(new Date());
  };
  
  // changeViewMode
  const changeViewMode = (mode) => {
    setViewMode(mode);
  };
  
  // handle date click
  const handleDateClick = (date) => {
    setSelectedDate(date);
    
    
    if (viewMode === 'day') {
      setCurrentDate(date);
    }
  };
  
  // handle task click
  const handleTaskClick = (task) => {
    setSelectedTask(task);
    setShowTaskModal(true);
  };
  
  // get task events
  const getTaskEvents = (date) => {
    return filteredTasks.filter(task => {
      // parse task start date
      let taskStart;
      if (task.start_date) {
        if (typeof task.start_date.toDate === 'function') {
          taskStart = task.start_date.toDate();
        } else if (task.start_date._seconds) {
          taskStart = new Date(task.start_date._seconds * 1000);
        } else {
          taskStart = new Date(task.start_date);
        }
      } else {
        return false;
      }
      
      // calculate end date
      const duration = task.duration || 1;
      const taskEnd = new Date(taskStart);
      taskEnd.setDate(taskStart.getDate() + duration - 1);
      
      // check task date
      return (
        date.getFullYear() === taskStart.getFullYear() &&
        date.getMonth() === taskStart.getMonth() &&
        date.getDate() === taskStart.getDate()
      ) || (
        date >= taskStart && date <= taskEnd
      );
    });
  };
  
  // generate dates
  const dates = generateDates();
  const weeksCount = getWeeksInMonth(dates);
  
  // generate weekday labels
  const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  // check is today
  const isToday = (date) => {
    const today = new Date();
    return date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();
  };
  
  // check is current month
  const isCurrentMonth = (date) => {
    return date.getMonth() === currentDate.getMonth();
  };
  
  // check is selected date
  const isSelectedDate = (date) => {
    return date.getDate() === selectedDate.getDate() &&
      date.getMonth() === selectedDate.getMonth() &&
      date.getFullYear() === selectedDate.getFullYear();
  };
  
  // render month view
  const renderMonthView = () => {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        {/* week label */}
        <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700">
          {weekdayLabels.map((day, index) => (
            <div key={day} className="py-2 text-sm font-medium text-center text-gray-500 dark:text-gray-400">
              {day}
            </div>
          ))}
        </div>
        
        {/* date grid */}
        <div className="grid grid-cols-7 auto-rows-auto">
          {dates.map((date, index) => {
            const dateEvents = getTaskEvents(date);
            const isCurrentMonthDate = isCurrentMonth(date);
            
            return (
              <div 
                key={index}
                onClick={() => handleDateClick(date)}
                className={`min-h-[100px] lg:min-h-[120px] p-2 border-b border-r border-gray-200 dark:border-gray-700 ${
                  isToday(date) 
                    ? 'bg-emerald-50 dark:bg-emerald-900/20' 
                    : isSelectedDate(date)
                      ? 'bg-blue-50 dark:bg-blue-900/20'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
                } ${
                  !isCurrentMonthDate ? 'text-gray-400 dark:text-gray-600 bg-gray-50 dark:bg-gray-800/50' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-sm font-medium ${
                    isToday(date) 
                      ? 'text-emerald-600 dark:text-emerald-400' 
                      : isCurrentMonthDate
                        ? 'text-gray-900 dark:text-white'
                        : 'text-gray-400 dark:text-gray-600'
                  }`}>
                    {date.getDate()}
                  </span>
                  {isToday(date) && (
                    <span className="px-1.5 py-0.5 text-xs font-medium bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 rounded-full">
                      Today
                    </span>
                  )}
                </div>
                
                {/* task list */}
                <div className="space-y-1 mt-1 overflow-y-auto max-h-[80px]">
                  {dateEvents.slice(0, 3).map((event, idx) => (
                    <div 
                      key={`${event.id}-${idx}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTaskClick(event);
                      }}
                      className="px-2 py-1 text-xs font-medium truncate rounded cursor-pointer"
                      style={{ backgroundColor: `${event.teamColor}30`, color: event.teamColor }}
                    >
                      {event.text}
                    </div>
                  ))}
                  {dateEvents.length > 3 && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 pl-2">
                      +{dateEvents.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };
  
  // render week view
  const renderWeekView = () => {
    const { start } = getDateRange();
    const weekDates = Array(7).fill(0).map((_, i) => {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      return date;
    });
    
    // hour labels
    const hourLabels = Array(24).fill(0).map((_, i) => {
      const hour = i % 12 === 0 ? 12 : i % 12;
      const period = i < 12 ? 'AM' : 'PM';
      return `${hour} ${period}`;
    });
    
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        {/* week label*/}
        <div className="grid grid-cols-8 border-b border-gray-200 dark:border-gray-700">
          <div className="py-2 text-sm font-medium text-center text-gray-500 dark:text-gray-400">
            Time
          </div>
          {weekDates.map((date, index) => (
            <div 
              key={index} 
              className={`py-2 text-sm font-medium text-center ${
                isToday(date) ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              <div>{weekdayLabels[date.getDay()]}</div>
              <div className="text-xs">{formatDate(date, 'medium')}</div>
              {isToday(date) && (
                <div className="mt-1 mx-auto w-2 h-2 rounded-full bg-emerald-500"></div>
              )}
            </div>
          ))}
        </div>
        
        {/* time table */}
        <div className="overflow-y-auto max-h-[calc(100vh-300px)]">
          <div className="relative grid grid-cols-8">
            {/* time scale */}
            <div className="border-r border-gray-200 dark:border-gray-700">
              {hourLabels.map((hour, index) => (
                <div 
                  key={index} 
                  className="h-16 px-2 py-1 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700"
                >
                  {hour}
                </div>
              ))}
            </div>
            
            {/* every day */}
            {weekDates.map((date, dateIndex) => (
              <div key={dateIndex} className="relative">
                {/* timebox */}
                {hourLabels.map((_, hourIndex) => (
                  <div 
                    key={hourIndex} 
                    className="h-16 border-b border-r border-gray-200 dark:border-gray-700"
                  ></div>
                ))}
                
                {/* today tasks */}
                {getTaskEvents(date).map((event, eventIndex) => {
                  // parse task start date
                  let startDate;
                  if (event.start_date) {
                    if (typeof event.start_date.toDate === 'function') {
                      startDate = event.start_date.toDate();
                    } else if (event.start_date._seconds) {
                      startDate = new Date(event.start_date._seconds * 1000);
                    } else {
                      startDate = new Date(event.start_date);
                    }
                  } else {
                    startDate = new Date();
                  }
                  
                  // calculate visual position
                  const hourHeight = 64; // 16px * 4 = 64px for each hour (matches h-16)
                  const startHour = startDate.getHours() + startDate.getMinutes() / 60;
                  const duration = event.duration || 1; 
                  const heightInHours = Math.min(duration * 4, 24 - startHour); 
                  
                  const top = startHour * hourHeight;
                  const height = heightInHours * hourHeight;
                  
                  return (
                    <div
                      key={eventIndex}
                      onClick={() => handleTaskClick(event)}
                      className="absolute left-0 right-0 mx-1 p-1 rounded-sm truncate overflow-hidden text-xs shadow-sm cursor-pointer"
                      style={{ 
                        top: `${top}px`, 
                        height: `${height}px`,
                        backgroundColor: `${event.teamColor}30`,
                        color: event.teamColor,
                        borderLeft: `3px solid ${event.teamColor}`
                      }}
                    >
                      <div className="font-medium">{event.text}</div>
                      <div>{formatDate(startDate, 'time')}</div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };
  
  // render day view
  const renderDayView = () => {
    // hour labels
    const hourLabels = Array(24).fill(0).map((_, i) => {
      const hour = i % 12 === 0 ? 12 : i % 12;
      const period = i < 12 ? 'AM' : 'PM';
      return `${hour} ${period}`;
    });
    
    const dateEvents = getTaskEvents(currentDate);
    
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        {/* date title */}
        <div className="py-3 px-4 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            {formatDate(currentDate, 'full')}
            {isToday(currentDate) && (
              <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 rounded-full">
                Today
              </span>
            )}
          </h3>
        </div>
        
        {/* time table */}
        <div className="overflow-y-auto max-h-[calc(100vh-300px)]">
          <div className="relative grid grid-cols-12">
            {/* time scale */}
            <div className="col-span-1 border-r border-gray-200 dark:border-gray-700">
              {hourLabels.map((hour, index) => (
                <div 
                  key={index} 
                  className="h-20 px-2 py-1 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700"
                >
                  {hour}
                </div>
              ))}
            </div>
            
            {/* today tasks */}
            <div className="col-span-11 relative">
              {/* timebox */}
              {hourLabels.map((_, hourIndex) => (
                <div 
                  key={hourIndex} 
                  className="h-20 border-b border-gray-200 dark:border-gray-700"
                ></div>
              ))}
              
              {/* tasks */}
              {dateEvents.map((event, eventIndex) => {
                // parse task start date
                let startDate;
                if (event.start_date) {
                  if (typeof event.start_date.toDate === 'function') {
                    startDate = event.start_date.toDate();
                  } else if (event.start_date._seconds) {
                    startDate = new Date(event.start_date._seconds * 1000);
                  } else {
                    startDate = new Date(event.start_date);
                  }
                } else {
                  startDate = new Date();
                }
                
                // calculate visual position
                const hourHeight = 80; // 20px * 4 = 80px for each hour (matches h-20)
                const startHour = startDate.getHours() + startDate.getMinutes() / 60;
                const duration = event.duration || 1;
                
                const heightInHours = Math.min(duration * 3, 24 - startHour);
                
                const top = startHour * hourHeight;
                const height = heightInHours * hourHeight;
                
                return (
                  <div
                    key={eventIndex}
                    onClick={() => handleTaskClick(event)}
                    className="absolute left-4 right-4 p-2 rounded shadow-md cursor-pointer overflow-hidden"
                    style={{ 
                      top: `${top}px`, 
                      height: `${height}px`,
                      backgroundColor: `${event.teamColor}20`,
                      color: event.teamColor,
                      borderLeft: `4px solid ${event.teamColor}`
                    }}
                  >
                    <div className="font-medium">{event.text}</div>
                    <div className="text-xs">{formatDate(startDate, 'time')}</div>
                    <div className="text-xs mt-1 text-gray-600 dark:text-gray-300">
                      {event.teamName}
                    </div>
                    {event.description && (
                      <div className="text-xs mt-1 line-clamp-2 text-gray-500 dark:text-gray-400">
                        {event.description}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };
  
  // render task modal
  const renderTaskModal = () => {
    if (!selectedTask) return null;
    
    // parse task start date
    let startDate;
    if (selectedTask.start_date) {
      if (typeof selectedTask.start_date.toDate === 'function') {
        startDate = selectedTask.start_date.toDate();
      } else if (selectedTask.start_date._seconds) {
        startDate = new Date(selectedTask.start_date._seconds * 1000);
      } else {
        startDate = new Date(selectedTask.start_date);
      }
    } else {
      startDate = new Date();
    }
    
    // calculate end date
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + (selectedTask.duration || 1) - 1);
    
    // status label style
    const getStatusColor = (status) => {
      switch (status) {
        case 'completed':
          return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300';
        case 'in-progress':
          return 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300';
        case 'on-hold':
          return 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300';
        default:
          return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300';
      }
    };
    
    // priority label style
    const getPriorityColor = (priority) => {
      switch (priority) {
        case 'high':
          return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300';
        case 'medium':
          return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300';
        case 'low':
          return 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300';
        default:
          return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300';
      }
    };
    
    return (
      <div className="fixed z-10 inset-0 overflow-y-auto" aria-labelledby="task-modal-title" role="dialog" aria-modal="true">
        <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
          {/* background mask */}
          <div 
            className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" 
            aria-hidden="true"
            onClick={() => setShowTaskModal(false)}
          ></div>
          
          {/* modal center trick */}
          <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
          
          {/* modal content */}
          <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
            {/* title bar */}
            <div className="py-4 px-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white" id="task-modal-title">
                  Task Details
                </h3>
                <button
                  type="button"
                  className="text-gray-400 hover:text-gray-500 dark:text-gray-300 dark:hover:text-gray-200"
                  onClick={() => setShowTaskModal(false)}
                >
                  <span className="sr-only">Close</span>
                  <i className="fas fa-times"></i>
                </button>
              </div>
            </div>
            
            {/* task details */}
            <div className="py-4 px-6">
              <div className="space-y-4">
                {/* task name and status */}
                <div>
                  <h4 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                    {selectedTask.text}
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(selectedTask.status)}`}>
                      {selectedTask.status === 'notStarted' ? 'Not Started' : 
                      selectedTask.status.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(selectedTask.priority)}`}>
                      {selectedTask.priority.charAt(0).toUpperCase() + selectedTask.priority.slice(1)} Priority
                    </span>
                    <span
                      className="px-2.5 py-0.5 rounded-full text-xs font-medium"
                      style={{ backgroundColor: `${selectedTask.teamColor}20`, color: selectedTask.teamColor }}
                    >
                      {selectedTask.teamName}
                    </span>
                  </div>
                </div>
                
                {/* date and progress */}
                <div className="space-y-2">
                  <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                    <i className="fas fa-calendar-alt mr-2"></i>
                    <span>{formatDate(startDate, 'full')}</span>
                    {selectedTask.duration > 1 && (
                      <>
                        <span className="mx-2">-</span>
                        <span>{formatDate(endDate, 'full')}</span>
                      </>
                    )}
                  </div>
                  
                  <div className="flex flex-col">
                    <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400 mb-1">
                      <span>Progress</span>
                      <span>{selectedTask.progress || 0}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                      <div 
                        className="bg-emerald-500 h-2.5 rounded-full" 
                        style={{ width: `${selectedTask.progress || 0}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
                
                {/* description */}
                {selectedTask.description && (
                  <div>
                    <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</h5>
                    <p className="text-sm text-gray-500 dark:text-gray-400 whitespace-pre-line">
                      {selectedTask.description}
                    </p>
                  </div>
                )}
                
                {/* assignees */}
                <div>
                  <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Assignees</h5>
                  {selectedTask.assignees && selectedTask.assignees.length > 0 ? (
                    <div className="space-y-2">
                      {selectedTask.assignees.map((assignee, index) => {
                        // check if current user
                        const isCurrentUser = userData && 
                          ((typeof assignee === 'string' && assignee === userData.uid) || 
                           (assignee.uid === userData.uid));
                        
                        return (
                          <div 
                            key={index} 
                            className={`flex items-center text-sm ${
                              isCurrentUser 
                                ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-l-4 border-emerald-500 pl-2 py-1 rounded'
                                : 'text-gray-500 dark:text-gray-400'
                            }`}
                          >
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center mr-2 ${
                              isCurrentUser 
                                ? 'bg-emerald-200 dark:bg-emerald-700'
                                : 'bg-gray-300 dark:bg-gray-700'
                            }`}>
                              <span className={`text-xs ${
                                isCurrentUser 
                                  ? 'text-emerald-700 dark:text-emerald-300'
                                  : 'text-gray-600 dark:text-gray-300'
                              }`}>
                                {(assignee.displayName || (typeof assignee === 'string' ? 'U' : assignee.email || 'U')).charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <span>{assignee.displayName || (typeof assignee === 'string' ? 'Unknown User' : assignee.email || 'Unknown User')}</span>
                            {isCurrentUser && (
                              <span className="ml-2 text-xs bg-emerald-100 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-200 px-2 py-0.5 rounded">You</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 dark:text-gray-400 italic">
                      No assignees
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {/* modal bottom */}
            <div className="bg-gray-50 dark:bg-gray-700 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
              <button
                type="button"
                className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-gray-800 dark:bg-gray-600 text-base font-medium text-white hover:bg-gray-900 dark:hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 sm:ml-3 sm:w-auto sm:text-sm"
                onClick={() => setShowTaskModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pt-16">
        <Header />
        <div className="flex items-center justify-center h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pt-16">
      <Header />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* calendar title and toolbar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {viewMode === 'month' 
                ? currentDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
                : viewMode === 'week'
                  ? `Week of ${dates[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
                  : formatDate(currentDate, 'full')
              }
            </h1>
          </div>
          
          <div className="flex items-center space-x-4 mt-4 md:mt-0">
            {/* calendar navigation buttons */}
            <div className="flex bg-white dark:bg-gray-800 rounded-lg shadow-sm">
              <button
                onClick={goToToday}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-l-lg"
              >
                Today
              </button>
              <div className="flex border-l border-r border-gray-200 dark:border-gray-700">
                <button
                  onClick={navigatePrevious}
                  className="px-3 py-2 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <i className="fas fa-chevron-left"></i>
                </button>
                <button
                  onClick={navigateNext}
                  className="px-3 py-2 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <i className="fas fa-chevron-right"></i>
                </button>
              </div>
              <div className="flex border-r border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => changeViewMode('month')}
                  className={`px-3 py-2 text-sm font-medium ${
                    viewMode === 'month' 
                      ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20' 
                      : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  Month
                </button>
                <button
                  onClick={() => changeViewMode('week')}
                  className={`px-3 py-2 text-sm font-medium ${
                    viewMode === 'week' 
                      ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20' 
                      : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  Week
                </button>
                <button
                  onClick={() => changeViewMode('day')}
                  className={`px-3 py-2 text-sm font-medium ${
                    viewMode === 'day' 
                      ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20' 
                      : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  Day
                </button>
              </div>
              <select
                value={selectedTeam}
                onChange={(e) => setSelectedTeam(e.target.value)}
                className="border-0 pl-3 pr-9 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-transparent focus:ring-0 focus:outline-none rounded-r-lg"
              >
                <option value="all">All Teams</option>
                {userTeams.map(team => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </div>
            
            {/* show my tasks only switch */}
            <div className="flex items-center bg-white dark:bg-gray-800 rounded-lg shadow-sm px-4 py-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200 mr-3">
                My tasks only
              </span>
              <button 
                onClick={toggleMyTasksFilter}
                className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors focus:outline-none ${
                  showOnlyMyTasks ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                }`}
                aria-pressed={showOnlyMyTasks}
                aria-labelledby="my-tasks-filter"
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    showOnlyMyTasks ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
        
        {/* calendar view */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          {viewMode === 'month' && renderMonthView()}
          {viewMode === 'week' && renderWeekView()}
          {viewMode === 'day' && renderDayView()}
        </div>
        
        {/* task details modal */}
        {showTaskModal && renderTaskModal()}
      </div>
    </div>
  );
};

export default Calendar;
