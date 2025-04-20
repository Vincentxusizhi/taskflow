import React, { useState, useEffect, useRef } from 'react';
import TaskList from './TaskList';
import './GanttChart.css';
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, differenceInDays, isWithinInterval } from 'date-fns';

const GanttChart = ({ tasks, onTaskClick, timeframe = 'week' }) => {
  const [dateRange, setDateRange] = useState([]);
  const [displayTasks, setDisplayTasks] = useState([]);
  const [scrollPosition, setScrollPosition] = useState(0);
  const timelineRef = useRef(null);
  const containerRef = useRef(null);

  // Calculate date range for the timeline based on timeframe
  useEffect(() => {
    const today = new Date();
    let start, end;

    switch (timeframe) {
      case 'week':
        start = startOfWeek(today, { weekStartsOn: 1 });
        end = endOfWeek(today, { weekStartsOn: 1 });
        break;
      case 'twoWeeks':
        start = startOfWeek(today, { weekStartsOn: 1 });
        end = addDays(start, 13);
        break;
      case 'month':
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        break;
      default:
        start = startOfWeek(today, { weekStartsOn: 1 });
        end = endOfWeek(today, { weekStartsOn: 1 });
    }

    const dates = eachDayOfInterval({ start, end });
    setDateRange(dates);
  }, [timeframe]);

  // Process tasks for display on the gantt chart
  useEffect(() => {
    if (tasks && dateRange.length > 0) {
      // Process tasks for gantt display
      const processed = tasks.map(task => {
        const startDate = task.startDate ? new Date(task.startDate) : new Date();
        const endDate = task.endDate ? new Date(task.endDate) : addDays(startDate, 1);
        
        // Calculate position and width
        const rangeStartDate = dateRange[0];
        const left = Math.max(0, differenceInDays(startDate, rangeStartDate) * 100);
        const width = Math.max(100, differenceInDays(endDate, startDate) * 100);
        
        // Check if task falls within our date range
        const isVisible = isWithinInterval(startDate, { 
          start: dateRange[0], 
          end: dateRange[dateRange.length - 1] 
        }) || isWithinInterval(endDate, { 
          start: dateRange[0], 
          end: dateRange[dateRange.length - 1] 
        });
        
        return {
          ...task,
          startDate,
          endDate,
          left,
          width,
          isVisible
        };
      });
      
      setDisplayTasks(processed);
    }
  }, [tasks, dateRange]);

  // Sync scroll between task list and timeline
  const handleScroll = (e) => {
    if (e.target === containerRef.current) {
      setScrollPosition(e.target.scrollTop);
    }
  };

  // Set timeline scroll position to match task list
  useEffect(() => {
    if (timelineRef.current) {
      timelineRef.current.scrollTop = scrollPosition;
    }
  }, [scrollPosition]);

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'completed': return 'var(--status-completed, #66bb6a)';
      case 'in progress': return 'var(--status-in-progress, #42a5f5)';
      case 'review': return 'var(--status-review, #ffca28)';
      case 'blocked': return 'var(--status-blocked, #ef5350)';
      default: return 'var(--status-todo, #bdbdbd)';
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority?.toLowerCase()) {
      case 'critical': return '#ffcdd2';
      case 'high': return '#ffe0b2';
      case 'medium': return '#e1f5fe';
      case 'low': return '#e0f2f1';
      default: return '#f5f5f5';
    }
  };

  return (
    <div className="gantt-chart-container">
      <TaskList tasks={tasks} onTaskClick={onTaskClick} />
      
      <div className="gantt-timeline" ref={containerRef} onScroll={handleScroll}>
        <div className="timeline-header">
          {dateRange.map((date, index) => (
            <div key={index} className="timeline-day">
              <div className="day-name">{format(date, 'EEE')}</div>
              <div className="day-date">{format(date, 'MMM d')}</div>
            </div>
          ))}
        </div>
        
        <div className="timeline-grid" ref={timelineRef}>
          {/* Grid lines */}
          {dateRange.map((date, index) => (
            <div key={index} className="timeline-grid-column" />
          ))}
          
          {/* Task bars */}
          {displayTasks.map((task, index) => (
            task.isVisible && (
              <div 
                key={index} 
                className="task-bar"
                style={{
                  left: `${task.left}px`,
                  width: `${task.width}px`,
                  top: `${index * 40}px`,
                  backgroundColor: getStatusColor(task.status),
                  borderLeft: `3px solid ${getPriorityColor(task.priority)}`
                }}
                onClick={() => onTaskClick && onTaskClick(task)}
              >
                <div className="task-bar-label">{task.name}</div>
              </div>
            )
          ))}
        </div>
      </div>
    </div>
  );
};

export default GanttChart; 