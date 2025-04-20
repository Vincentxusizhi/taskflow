import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import Header from './Header';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Doughnut, Line, Pie } from 'react-chartjs-2';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

const Reports = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState(null);
  const [userTeams, setUserTeams] = useState([]);
  const [userTasks, setUserTasks] = useState([]);
  const [tasksByStatus, setTasksByStatus] = useState({
    labels: [],
    data: []
  });
  const [tasksByPriority, setTasksByPriority] = useState({
    labels: [],
    data: []
  });
  const [taskProgressByTeam, setTaskProgressByTeam] = useState({
    labels: [],
    data: []
  });
  const [taskCompletionTrend, setTaskCompletionTrend] = useState({
    labels: [],
    data: []
  });
  const [selectedTimeRange, setSelectedTimeRange] = useState('month');
  const [selectedTeam, setSelectedTeam] = useState('all');

  // Fetch user data
  useEffect(() => {
    const fetchUserData = async () => {
      if (!auth.currentUser) return;

      try {
        setLoading(true);
        const userId = auth.currentUser.uid;
        const functions = getFunctions();

        // Get user profile data using cloud function
        const getUserProfile = httpsCallable(functions, 'getUserProfile');
        const result = await getUserProfile({ userId });
        const { user, teams, tasks } = result.data;

        setUserData(user);
        setUserTeams(teams);
        setUserTasks(tasks);

        // Process the data for charts
        processTasksByStatus(tasks);
        processTasksByPriority(tasks);
        processTaskProgressByTeam(tasks, teams);
        processTaskCompletionTrend(tasks);

      } catch (error) {
        console.error('Error fetching report data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, []);

  // Update charts when time range or team filter changes
  useEffect(() => {
    if (userTasks.length > 0 && userTeams.length > 0) {
      processTaskCompletionTrend(userTasks);
      
      // Filter tasks by selected team if needed
      const filteredTasks = selectedTeam === 'all'
        ? userTasks
        : userTasks.filter(task => task.teamId === selectedTeam);
      
      processTasksByStatus(filteredTasks);
      processTasksByPriority(filteredTasks);
      processTaskProgressByTeam(filteredTasks, userTeams);
    }
  }, [selectedTimeRange, selectedTeam, userTasks, userTeams]);

  // Process tasks by status
  const processTasksByStatus = (tasks) => {
    const statusCounts = {
      'not-started': 0,
      'in-progress': 0,
      'completed': 0,
      'on-hold': 0
    };

    tasks.forEach(task => {
      const status = task.status || 'not-started';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    const labels = Object.keys(statusCounts).map(status => {
      // Format the status labels for better readability
      return status
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    });

    setTasksByStatus({
      labels,
      data: Object.values(statusCounts)
    });
  };

  // Process tasks by priority
  const processTasksByPriority = (tasks) => {
    const priorityCounts = {
      'low': 0,
      'medium': 0,
      'high': 0
    };

    tasks.forEach(task => {
      const priority = task.priority || 'medium';
      priorityCounts[priority] = (priorityCounts[priority] || 0) + 1;
    });

    const labels = Object.keys(priorityCounts).map(priority => 
      priority.charAt(0).toUpperCase() + priority.slice(1)
    );

    setTasksByPriority({
      labels,
      data: Object.values(priorityCounts)
    });
  };

  // Process task progress by team
  const processTaskProgressByTeam = (tasks, teams) => {
    const teamProgress = {};
    const teamTaskCounts = {};

    // Initialize with all teams
    teams.forEach(team => {
      teamProgress[team.id] = 0;
      teamTaskCounts[team.id] = 0;
    });

    // Calculate average progress for each team
    tasks.forEach(task => {
      if (task.teamId && teamProgress.hasOwnProperty(task.teamId)) {
        teamProgress[task.teamId] += task.progress || 0;
        teamTaskCounts[task.teamId]++;
      }
    });

    // Calculate average and filter out teams with no tasks
    const teamsWithTasks = teams.filter(team => teamTaskCounts[team.id] > 0);
    
    const labels = teamsWithTasks.map(team => team.name);
    const data = teamsWithTasks.map(team => 
      teamTaskCounts[team.id] > 0 
        ? Math.round(teamProgress[team.id] / teamTaskCounts[team.id]) 
        : 0
    );

    setTaskProgressByTeam({
      labels,
      data
    });
  };

  // Process task completion trend
  const processTaskCompletionTrend = (tasks) => {
    // Determine date range based on selected time range
    const now = new Date();
    let startDate = new Date();
    let dateFormat = {};
    let labels = [];

    if (selectedTimeRange === 'week') {
      // Past 7 days
      startDate.setDate(now.getDate() - 7);
      dateFormat = { weekday: 'short' };
      labels = Array.from({ length: 7 }, (_, i) => {
        const date = new Date();
        date.setDate(now.getDate() - (6 - i));
        return date.toLocaleDateString(undefined, dateFormat);
      });
    } else if (selectedTimeRange === 'month') {
      // Past 30 days, but we'll show in weeks
      startDate.setDate(now.getDate() - 30);
      labels = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
    } else if (selectedTimeRange === 'year') {
      // Past 12 months
      startDate.setMonth(now.getMonth() - 11);
      dateFormat = { month: 'short' };
      labels = Array.from({ length: 12 }, (_, i) => {
        const date = new Date();
        date.setMonth(now.getMonth() - (11 - i));
        return date.toLocaleDateString(undefined, { month: 'short' });
      });
    }

    // Filter tasks completed within the selected time range
    const completedTasks = tasks.filter(task => 
      task.status === 'completed' && 
      task.completedAt && 
      (
        (task.completedAt instanceof Date && task.completedAt >= startDate) ||
        (task.completedAt.toDate && task.completedAt.toDate() >= startDate) ||
        (task.completedAt._seconds && new Date(task.completedAt._seconds * 1000) >= startDate)
      )
    );

    // Count tasks completed in each period
    let data;
    
    if (selectedTimeRange === 'week') {
      // For past 7 days
      data = Array(7).fill(0);
      
      completedTasks.forEach(task => {
        const completedDate = getDateFromTimestamp(task.completedAt);
        const dayDiff = Math.floor((completedDate - startDate) / (1000 * 60 * 60 * 24));
        if (dayDiff >= 0 && dayDiff < 7) {
          data[dayDiff]++;
        }
      });
    } else if (selectedTimeRange === 'month') {
      // For past 30 days - show weeks
      data = Array(4).fill(0);
      
      completedTasks.forEach(task => {
        const completedDate = getDateFromTimestamp(task.completedAt);
        const dayDiff = Math.floor((completedDate - startDate) / (1000 * 60 * 60 * 24));
        if (dayDiff >= 0 && dayDiff < 30) {
          const weekIndex = Math.floor(dayDiff / 7);
          if (weekIndex < 4) {
            data[weekIndex]++;
          }
        }
      });
    } else if (selectedTimeRange === 'year') {
      // For past 12 months
      data = Array(12).fill(0);
      
      completedTasks.forEach(task => {
        const completedDate = getDateFromTimestamp(task.completedAt);
        const monthDiff = (completedDate.getFullYear() - startDate.getFullYear()) * 12 + 
                         completedDate.getMonth() - startDate.getMonth();
        if (monthDiff >= 0 && monthDiff < 12) {
          data[monthDiff]++;
        }
      });
    }

    setTaskCompletionTrend({
      labels,
      data
    });
  };

  // Helper function to get Date from various timestamp formats
  const getDateFromTimestamp = (timestamp) => {
    if (!timestamp) return new Date();
    
    if (timestamp instanceof Date) {
      return timestamp;
    } else if (typeof timestamp.toDate === 'function') {
      return timestamp.toDate();
    } else if (timestamp._seconds) {
      return new Date(timestamp._seconds * 1000);
    } else {
      return new Date(timestamp);
    }
  };

  // Handle time range change
  const handleTimeRangeChange = (range) => {
    setSelectedTimeRange(range);
  };

  // Handle team filter change
  const handleTeamFilterChange = (e) => {
    setSelectedTeam(e.target.value);
  };

  // Chart options
  const doughnutOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'right',
      },
      title: {
        display: true,
        text: 'Task Distribution',
      },
    },
    maintainAspectRatio: false,
  };

  const barOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: 'Task Progress by Team',
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        title: {
          display: true,
          text: 'Progress (%)'
        }
      }
    },
    maintainAspectRatio: false,
  };

  const lineOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: 'Tasks Completed Over Time',
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Number of Tasks'
        }
      }
    },
    maintainAspectRatio: false,
  };

  // Chart data
  const statusData = {
    labels: tasksByStatus.labels,
    datasets: [
      {
        label: 'Tasks by Status',
        data: tasksByStatus.data,
        backgroundColor: [
          'rgba(75, 192, 192, 0.6)',  // Teal - completed
          'rgba(54, 162, 235, 0.6)',  // Blue - in progress
          'rgba(255, 206, 86, 0.6)',  // Yellow - not started
          'rgba(255, 99, 132, 0.6)',  // Red - on hold
        ],
        borderWidth: 1,
      },
    ],
  };

  const priorityData = {
    labels: tasksByPriority.labels,
    datasets: [
      {
        label: 'Tasks by Priority',
        data: tasksByPriority.data,
        backgroundColor: [
          'rgba(75, 192, 192, 0.6)',  // Teal - low
          'rgba(255, 206, 86, 0.6)',  // Yellow - medium
          'rgba(255, 99, 132, 0.6)',  // Red - high
        ],
        borderWidth: 1,
      },
    ],
  };

  const teamProgressData = {
    labels: taskProgressByTeam.labels,
    datasets: [
      {
        label: 'Average Progress',
        data: taskProgressByTeam.data,
        backgroundColor: 'rgba(54, 162, 235, 0.6)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1,
      },
    ],
  };

  const completionTrendData = {
    labels: taskCompletionTrend.labels,
    datasets: [
      {
        label: 'Tasks Completed',
        data: taskCompletionTrend.data,
        fill: false,
        backgroundColor: 'rgba(75, 192, 192, 0.6)',
        borderColor: 'rgba(75, 192, 192, 1)',
        tension: 0.1,
      },
    ],
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
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Task Reports & Analytics
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Visualize your task performance and team progress
          </p>
        </div>
        
        {/* Filter Controls */}
        <div className="mb-8 flex flex-wrap gap-4 items-center justify-between bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
          <div className="flex items-center space-x-4">
            <span className="text-gray-700 dark:text-gray-300">Time Range:</span>
            <div className="flex space-x-2">
              <button
                className={`px-3 py-1 rounded-md text-sm ${
                  selectedTimeRange === 'week'
                    ? 'bg-emerald-500 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                }`}
                onClick={() => handleTimeRangeChange('week')}
              >
                Week
              </button>
              <button
                className={`px-3 py-1 rounded-md text-sm ${
                  selectedTimeRange === 'month'
                    ? 'bg-emerald-500 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                }`}
                onClick={() => handleTimeRangeChange('month')}
              >
                Month
              </button>
              <button
                className={`px-3 py-1 rounded-md text-sm ${
                  selectedTimeRange === 'year'
                    ? 'bg-emerald-500 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                }`}
                onClick={() => handleTimeRangeChange('year')}
              >
                Year
              </button>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <span className="text-gray-700 dark:text-gray-300">Team:</span>
            <select
              className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              value={selectedTeam}
              onChange={handleTeamFilterChange}
            >
              <option value="all">All Teams</option>
              {userTeams.map(team => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </select>
          </div>
        </div>
        
        {/* Charts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Task Completion Trend */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              Task Completion Trend
            </h2>
            <div className="h-80">
              <Line options={lineOptions} data={completionTrendData} />
            </div>
          </div>
          
          {/* Task Progress by Team */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              Task Progress by Team
            </h2>
            <div className="h-80">
              <Bar options={barOptions} data={teamProgressData} />
            </div>
          </div>
          
          {/* Tasks by Status */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              Tasks by Status
            </h2>
            <div className="h-80">
              <Doughnut options={doughnutOptions} data={statusData} />
            </div>
          </div>
          
          {/* Tasks by Priority */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              Tasks by Priority
            </h2>
            <div className="h-80">
              <Pie options={doughnutOptions} data={priorityData} />
            </div>
          </div>
        </div>
        
        {/* Summary Statistics */}
        <div className="mt-8 bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
            Summary Statistics
          </h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
              <div className="flex items-center">
                <div className="flex-shrink-0 h-12 w-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center">
                  <i className="fas fa-check-circle text-emerald-600 dark:text-emerald-400 text-xl"></i>
                </div>
                <div className="ml-4">
                  <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Completion Rate</div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">
                    {userTasks.length > 0 
                      ? `${Math.round((userTasks.filter(t => t.status === 'completed').length / userTasks.length) * 100)}%` 
                      : '0%'}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
              <div className="flex items-center">
                <div className="flex-shrink-0 h-12 w-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                  <i className="fas fa-tasks text-blue-600 dark:text-blue-400 text-xl"></i>
                </div>
                <div className="ml-4">
                  <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Tasks</div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">
                    {userTasks.length}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
              <div className="flex items-center">
                <div className="flex-shrink-0 h-12 w-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                  <i className="fas fa-exclamation-circle text-red-600 dark:text-red-400 text-xl"></i>
                </div>
                <div className="ml-4">
                  <div className="text-sm font-medium text-gray-500 dark:text-gray-400">High Priority</div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">
                    {userTasks.filter(t => t.priority === 'high').length}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
              <div className="flex items-center">
                <div className="flex-shrink-0 h-12 w-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center">
                  <i className="fas fa-clock text-yellow-600 dark:text-yellow-400 text-xl"></i>
                </div>
                <div className="ml-4">
                  <div className="text-sm font-medium text-gray-500 dark:text-gray-400">In Progress</div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">
                    {userTasks.filter(t => t.status === 'in-progress').length}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reports; 