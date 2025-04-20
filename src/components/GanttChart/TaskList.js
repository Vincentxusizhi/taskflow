import React, { useRef, useEffect } from 'react';
import './TaskList.css';

const TaskList = ({ tasks, onTaskClick, scrollPosition, onScroll }) => {
  const taskListRef = useRef(null);

  // Sync scroll position with the Gantt chart timeline
  useEffect(() => {
    if (taskListRef.current && scrollPosition !== undefined) {
      taskListRef.current.scrollTop = scrollPosition;
    }
  }, [scrollPosition]);

  // Handle scroll events and propagate to parent
  const handleScroll = (e) => {
    if (onScroll) {
      onScroll(e.target.scrollTop);
    }
  };

  // Get appropriate color for task priority
  const getPriorityColor = (priority) => {
    switch (priority?.toLowerCase()) {
      case 'high':
        return '#f44336'; // Red
      case 'medium':
        return '#ff9800'; // Orange
      case 'low':
        return '#4caf50'; // Green
      default:
        return '#9e9e9e'; // Grey
    }
  };

  // Get appropriate color for task status
  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'completed':
        return '#4caf50'; // Green
      case 'in progress':
        return '#2196f3'; // Blue
      case 'not started':
        return '#9e9e9e'; // Grey
      case 'delayed':
        return '#f44336'; // Red
      default:
        return '#9e9e9e'; // Grey
    }
  };

  // Calculate how many days are left until the due date
  const getDaysLeft = (dueDate) => {
    if (!dueDate) return 'No due date';
    
    const today = new Date();
    const due = new Date(dueDate);
    
    // Reset hours to compare only dates
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    
    const diffTime = due - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      return `${Math.abs(diffDays)} days overdue`;
    } else if (diffDays === 0) {
      return 'Due today';
    } else if (diffDays === 1) {
      return '1 day left';
    } else {
      return `${diffDays} days left`;
    }
  };

  return (
    <div className="task-list-container" ref={taskListRef} onScroll={handleScroll}>
      <div className="task-list-header">
        <div className="task-header-item task-name">Task</div>
        <div className="task-header-item task-priority">Priority</div>
        <div className="task-header-item task-status">Status</div>
        <div className="task-header-item task-due-date">Due Date</div>
      </div>
      <div className="task-list-items">
        {tasks.length === 0 ? (
          <div className="no-tasks-message">No tasks available for the selected timeframe.</div>
        ) : (
          tasks.map(task => (
            <div 
              key={task.id} 
              className="task-list-item" 
              onClick={() => onTaskClick(task)}
            >
              <div className="task-item-name">{task.title}</div>
              <div className="task-item-priority">
                <span 
                  className="priority-indicator" 
                  style={{ backgroundColor: getPriorityColor(task.priority) }}
                ></span>
                {task.priority || 'N/A'}
              </div>
              <div className="task-item-status">
                <span 
                  className="status-indicator" 
                  style={{ backgroundColor: getStatusColor(task.status) }}
                ></span>
                {task.status || 'N/A'}
              </div>
              <div className="task-item-due-date">
                {task.dueDate ? (
                  <>
                    <div className="due-date-value">
                      {new Date(task.dueDate).toLocaleDateString()}
                    </div>
                    <div 
                      className={`days-left ${getDaysLeft(task.dueDate).includes('overdue') ? 'overdue' : ''}`}
                    >
                      {getDaysLeft(task.dueDate)}
                    </div>
                  </>
                ) : (
                  'Not set'
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default TaskList; 