import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import { doc, getDoc, collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import Header from './Header';
import { logInfo, logError, logWarn } from '../utils/logger';

const Dashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState(null);
  const [userTeams, setUserTeams] = useState([]);
  const [userTasks, setUserTasks] = useState([]);
  const [recentNotifications, setRecentNotifications] = useState([]);
  const [completedTasksCount, setCompletedTasksCount] = useState(0);
  const [pendingTasksCount, setPendingTasksCount] = useState(0);
  const [upcomingTasks, setUpcomingTasks] = useState([]);
  const [stats, setStats] = useState({
    totalTeams: 0,
    totalTasks: 0,
    completedTasks: 0,
    overdueTasks: 0
  });

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
        
        // Process tasks
        const completed = tasks.filter(task => task.status === 'completed').length;
        const pending = tasks.filter(task => task.status !== 'completed').length;
        
        // Get upcoming tasks (tasks with status "notStarted" due in next 7 days)
        const today = new Date();
        const nextWeek = new Date(today);
        nextWeek.setDate(today.getDate() + 7);
        
        const upcoming = tasks
          .filter(task => {
            const dueDate = calculateDueDate(task.start_date, task.duration);
            if (!dueDate) return false;
            return dueDate > today && dueDate <= nextWeek && task.status === 'notStarted';
          })
          .sort((a, b) => {
            const dueDateA = calculateDueDate(a.start_date, a.duration);
            const dueDateB = calculateDueDate(b.start_date, b.duration);
            return dueDateA - dueDateB;
          })
          .slice(0, 5); // Get top 5 upcoming tasks
        
        // Get in-progress tasks for Recent Activity section
        const inProgressTasks = tasks
          .filter(task => task.status === 'inProgress')
          .sort((a, b) => {
            // Sort by most recently updated if available, otherwise by due date
            if (a.updatedAt && b.updatedAt) {
              return new Date(b.updatedAt) - new Date(a.updatedAt);
            }
            const dueDateA = calculateDueDate(a.start_date, a.duration);
            const dueDateB = calculateDueDate(b.start_date, b.duration);
            return dueDateA - dueDateB;
          })
          .slice(0, 5); // Get top 5 in-progress tasks
        
        setUserTasks(tasks);
        setCompletedTasksCount(completed);
        setPendingTasksCount(pending);
        setUpcomingTasks(upcoming);
        
        // Calculate overdue tasks
        const overdue = tasks.filter(task => {
          const dueDate = calculateDueDate(task.start_date, task.duration);
          return dueDate && dueDate < today && task.status !== 'completed';
        }).length;
        
        // Set stats
        setStats({
          totalTeams: teams.length,
          totalTasks: tasks.length,
          completedTasks: completed,
          overdueTasks: overdue
        });

        // get latest notifications
        const notifications = [];
        try {
          const notificationsRef = collection(db, 'notifications');
          const q = query(
            notificationsRef,
            where('userId', '==', userId),
            orderBy('createdAt', 'desc'), 
            limit(5)
          );
          
          const querySnapshot = await getDocs(q);
          querySnapshot.forEach(doc => {
            notifications.push({
              id: doc.id,
              ...doc.data(),
              createdAt: doc.data().createdAt?.toDate() || new Date()
            });
          });
        } catch (notificationError) {
          console.error('Error fetching notifications:', notificationError);
          try {
            const notificationsRef = collection(db, 'notifications');
            const basicQuery = query(
              notificationsRef,
              where('userId', '==', userId),
              limit(10)
            );
            
            const querySnapshot = await getDocs(basicQuery);
            querySnapshot.forEach(doc => {
              notifications.push({
                id: doc.id,
                ...doc.data(),
                createdAt: doc.data().createdAt?.toDate() || new Date()
              });
            });
            
            notifications.sort((a, b) => {
              if (!a.createdAt || !b.createdAt) return 0;
              return b.createdAt - a.createdAt;
            });
            
            // only keep top 5
            notifications.splice(5);
          } catch (fallbackError) {
            console.error('Fallback notification fetch also failed:', fallbackError);
          }
        }
        
        setRecentNotifications(notifications);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, []);

  // Calculate task due date
  const calculateDueDate = (startDate, duration) => {
    if (!startDate) return null;
    
    // Handle different startDate formats
    let start;
    
    // If it's a Firestore timestamp with toDate method
    if (startDate && typeof startDate.toDate === 'function') {
      start = startDate.toDate();
    } 
    // If it's a serialized timestamp object with _seconds
    else if (startDate && startDate._seconds) {
      start = new Date(startDate._seconds * 1000);
    }
    // If it's already a Date object
    else if (startDate instanceof Date) {
      start = startDate;
    }
    // Try to parse as a date string or timestamp
    else {
      start = new Date(startDate);
    }
    
    if (isNaN(start.getTime())) return null; // Invalid date
    
    const dueDate = new Date(start);
    dueDate.setDate(dueDate.getDate() + (parseInt(duration) || 0));
    return dueDate;
  };

  // Format date
  const formatDate = (date) => {
    if (!date) return 'N/A';
    if (!(date instanceof Date)) return 'Invalid Date';
    
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Navigate to team details
  const navigateToTeam = (teamId) => {
    navigate(`/team/${teamId}/tasks`);
  };

  // Navigate to task details
  const navigateToTask = (teamId) => {
    navigate(`/team/${teamId}/tasks`);
  };

  // Calculate task progress color
  const getProgressColor = (progress) => {
    if (progress < 25) return 'bg-red-500';
    if (progress < 50) return 'bg-yellow-500';
    if (progress < 75) return 'bg-blue-500';
    return 'bg-emerald-500';
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
        {/* Welcome section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Welcome back, {userData?.displayName || 'User'}
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Here's an overview of your workspace and recent activities
          </p>
        </div>
        
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Teams count */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 flex items-center space-x-4">
            <div className="flex-shrink-0 w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center">
              <i className="fas fa-users text-emerald-600 dark:text-emerald-400 text-xl"></i>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Teams</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalTeams}</div>
            </div>
          </div>
          
          {/* Tasks count */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 flex items-center space-x-4">
            <div className="flex-shrink-0 w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
              <i className="fas fa-tasks text-blue-600 dark:text-blue-400 text-xl"></i>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Tasks</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalTasks}</div>
            </div>
          </div>
          
          {/* Completed Tasks */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 flex items-center space-x-4">
            <div className="flex-shrink-0 w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
              <i className="fas fa-check-circle text-green-600 dark:text-green-400 text-xl"></i>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Completed</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {stats.completedTasks}
                <span className="text-sm font-normal text-gray-500 dark:text-gray-400 ml-1">/ {stats.totalTasks}</span>
              </div>
            </div>
          </div>
          
          {/* Overdue Tasks */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 flex items-center space-x-4">
            <div className="flex-shrink-0 w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
              <i className="fas fa-exclamation-circle text-red-600 dark:text-red-400 text-xl"></i>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Overdue</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.overdueTasks}</div>
            </div>
          </div>
        </div>
        
        {/* Main Content - 2 column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left column - Tasks and Activity */}
          <div className="lg:col-span-2 space-y-8">
            {/* Upcoming Tasks */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                <h2 className="text-lg font-medium text-gray-900 dark:text-white">Due in the next 7 days</h2>
                
              </div>
              <div className="p-6">
                {upcomingTasks.length > 0 ? (
                  <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                    {upcomingTasks.map(task => (
                      <li key={task.id} className="py-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {task.text}
                            </p>
                            <div className="mt-1 flex items-center text-sm text-gray-500 dark:text-gray-400">
                              <i className="fas fa-calendar-alt mr-1.5"></i>
                              <span>Due: {formatDate(calculateDueDate(task.start_date, task.duration))}</span>
                              <span className="mx-2">•</span>
                              <i className="fas fa-users mr-1.5"></i>
                              <span>{task.teamName}</span>
                            </div>
                            <div className="mt-2">
                              <div className="relative w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div 
                                  className={`absolute top-0 left-0 h-full ${getProgressColor(task.progress)}`}
                                  style={{ width: `${task.progress}%` }}
                                ></div>
                              </div>
                              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                {task.progress}% complete
                              </div>
                            </div>
                          </div>
                          <span className={`ml-3 px-2.5 py-0.5 rounded-full text-xs font-medium
                            ${task.priority === 'high' ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300' :
                              task.priority === 'medium' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300' :
                              'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300'}`}
                          >
                            {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-center py-8">
                    <div className="mb-4">
                      <i className="fas fa-check text-gray-400 dark:text-gray-500 text-4xl"></i>
                    </div>
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white">No upcoming tasks</h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">You're all caught up!</p>
                  </div>
                )}
              </div>
            </div>
            
            {/* Recent Activity - Notifications */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-medium text-gray-900 dark:text-white">Recent Activity</h2>
              </div>
              <div className="p-6">
                {recentNotifications.length > 0 ? (
                  <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                    {recentNotifications.map(notification => (
                      <li key={notification.id} className="py-4">
                        <div className="flex items-start">
                          <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center
                            ${notification.type?.includes('team') ? 'bg-emerald-100 dark:bg-emerald-900/30' : 
                              notification.type?.includes('task') ? 'bg-blue-100 dark:bg-blue-900/30' :
                              'bg-gray-100 dark:bg-gray-700'}`}
                          >
                            <i className={`fas 
                              ${notification.type?.includes('invitation') ? 'fa-user-plus' : 
                                notification.type?.includes('team') ? 'fa-users' : 
                                notification.type?.includes('task') ? 'fa-tasks' : 
                                'fa-bell'} 
                              text-lg
                              ${notification.type?.includes('team') ? 'text-emerald-600 dark:text-emerald-400' : 
                                notification.type?.includes('task') ? 'text-blue-600 dark:text-blue-400' :
                                'text-gray-600 dark:text-gray-400'}`}
                            ></i>
                          </div>
                          <div className="ml-4 flex-1">
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              {notification.title}
                            </p>
                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                              {notification.message}
                            </p>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                              {notification.createdAt ? formatDate(notification.createdAt) : 'Recent'}
                            </p>
                          </div>
                          {notification.read === false && (
                            <div className="ml-2 flex-shrink-0">
                              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-center py-8">
                    <div className="mb-4">
                      <i className="far fa-bell-slash text-gray-400 dark:text-gray-500 text-4xl"></i>
                    </div>
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white">No recent notifications</h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      We'll notify you when something happens
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Right column - Team info and Profile summary */}
          <div className="space-y-8">
            {/* User Profile Summary */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-medium text-gray-900 dark:text-white">My Profile</h2>
              </div>
              <div className="p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0 w-20 h-20 rounded-full overflow-hidden border-4 border-emerald-100 dark:border-emerald-900/30 flex items-center justify-center bg-emerald-200 text-emerald-700 dark:bg-emerald-700 dark:text-emerald-100 text-3xl font-medium">
                    {/* Conditional Rendering: Image or Initials */}
                    {userData?.photoURL ? (
                      <img 
                        src={userData.photoURL} 
                        alt={userData.displayName} 
                        className="w-full h-full object-cover"
                        // Keep onError for actual image load errors, but maybe simplify fallback
                        onError={(e) => {
                          e.target.onerror = null; // Prevent loops
                          e.target.style.display = 'none'; // Hide broken image icon
                          // Optionally show initials here too if image fails
                          const initialsContainer = e.target.nextElementSibling; 
                          if(initialsContainer) initialsContainer.style.display = 'flex'; 
                        }}
                      />
                    ) : (
                      // Display Initials if no photoURL
                      <span>
                        {userData?.displayName?.charAt(0).toUpperCase() || userData?.email?.charAt(0).toUpperCase() || 'U'}
                      </span>
                    )}
                    {/* Sibling element for onError fallback initials (initially hidden) */}
                    {!userData?.photoURL && (
                       <span style={{display: 'none'}} className="w-full h-full flex items-center justify-center">
                         {userData?.displayName?.charAt(0).toUpperCase() || userData?.email?.charAt(0).toUpperCase() || 'U'}
                       </span>
                    )}
                  </div>
                  <div className="ml-6">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">{userData?.displayName}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{userData?.email}</p>
                    {userData?.role && (
                      <p className="mt-1 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                        {userData.role}
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="mt-6 grid grid-cols-2 gap-4 text-center">
                  <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalTasks}</div>
                    <div className="text-xs font-medium text-gray-500 dark:text-gray-400">Assigned Tasks</div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalTeams}</div>
                    <div className="text-xs font-medium text-gray-500 dark:text-gray-400">Teams</div>
                  </div>
                </div>
                
                <div className="mt-6 flex justify-center">
                  <button
                    onClick={() => navigate(`/profile/${auth.currentUser.uid}`)}
                    className="px-4 py-2 bg-emerald-500 dark:bg-emerald-600 text-white rounded-lg hover:bg-emerald-600 dark:hover:bg-emerald-700 transition-colors text-sm"
                  >
                    View Full Profile
                  </button>
                </div>
              </div>
            </div>
            
            {/* My Teams */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                <h2 className="text-lg font-medium text-gray-900 dark:text-white">My Teams</h2>
                <button
                  onClick={() => navigate('/Teams')}
                  className="text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 font-medium"
                >
                  View All
                </button>
              </div>
              <div className="p-6">
                {userTeams.length > 0 ? (
                  <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                    {userTeams.slice(0, 5).map(team => (
                      <li key={team.id} className="py-4 hover:bg-gray-50 dark:hover:bg-gray-700 px-2 rounded-md cursor-pointer" onClick={() => navigateToTeam(team.id)}>
                        <div className="flex items-center space-x-4">
                          <div className="flex-shrink-0 h-10 w-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center">
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                              {team.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {team.name}
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              {team.membersData?.length || 0} members
                            </p>
                          </div>
                          <i className="fas fa-chevron-right text-gray-400 dark:text-gray-600"></i>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-center py-8">
                    <div className="mb-4">
                      <i className="fas fa-users text-gray-400 dark:text-gray-500 text-4xl"></i>
                    </div>
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white">No teams yet</h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      Join or create a team to start collaborating
                    </p>
                    <button
                      onClick={() => navigate('/Teams')}
                      className="mt-4 px-4 py-2 bg-emerald-500 dark:bg-emerald-600 text-white rounded-lg hover:bg-emerald-600 dark:hover:bg-emerald-700 transition-colors text-sm"
                    >
                      Create Team
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard; 