import React, { useRef, useEffect, useState } from 'react';
import TimeAxis from './TimeAxis';
import './GanttChart.css';

const GanttVisualization = ({ 
  tasks, 
  dateRange, 
  timeScale,
  onTaskClick,
  onTaskDrag
}) => {
  const [taskBars, setTaskBars] = useState([]);
  const [draggedTask, setDraggedTask] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragTooltip, setDragTooltip] = useState({ visible: false, date: null, x: 0, y: 0 });
  const containerRef = useRef(null);
  const gridRef = useRef(null);
  
  // Set CSS variables for TimeAxis based on the current timeScale
  useEffect(() => {
    const root = document.documentElement;
    if (timeScale === 'day') {
      root.style.setProperty('--day-width', '50px');
    } else if (timeScale === 'week') {
      root.style.setProperty('--day-width', '20px');
      root.style.setProperty('--week-width', '140px');
    } else {
      root.style.setProperty('--day-width', '15px');
      root.style.setProperty('--month-width', '100px');
    }
  }, [timeScale]);
  
  // Calculate task positions based on date range
  useEffect(() => {
    if (!tasks || !dateRange.start || !dateRange.end) return;

    const startDate = new Date(dateRange.start);
    const endDate = new Date(dateRange.end);
    const totalDays = Math.ceil((endDate - startDate) / (24 * 60 * 60 * 1000));
    
    // Calculate day width based on the time scale
    let dayWidth;
    if (timeScale === 'day') {
      dayWidth = 50; // Pixels per day in day view
    } else if (timeScale === 'week') {
      dayWidth = 20; // Narrower in week view
    } else {
      dayWidth = 15; // Even narrower in month view
    }
    
    // Calculate task positions and dimensions
    const calculatedTaskBars = tasks.map((task, index) => {
      // Calculate position
      const taskStart = getDateFromAnyFormat(task.start_date);
      
      // Calculate days from start date
      const dayDiff = Math.floor((taskStart - startDate) / (24 * 60 * 60 * 1000));
      
      // Calculate duration in pixels
      const duration = task.duration || 1; // Default 1 day if not specified
      
      return {
        ...task,
        position: {
          left: Math.max(0, dayDiff * dayWidth),
          top: index * 40 + 10, // 40px height per task + padding
          width: duration * dayWidth,
          height: 30
        },
        visible: dayDiff + duration >= 0 && dayDiff <= totalDays
      };
    });
    
    setTaskBars(calculatedTaskBars);
  }, [tasks, dateRange, timeScale]);

  // Helper function to handle various date formats
  const getDateFromAnyFormat = (dateValue) => {
    if (!dateValue) {
      return new Date();
    }
    
    if (dateValue instanceof Date) {
      return dateValue;
    }
    
    if (typeof dateValue.toDate === 'function') {
      return dateValue.toDate();
    }
    
    if (dateValue._seconds) {
      return new Date(dateValue._seconds * 1000);
    }
    
    return new Date(dateValue);
  };

  // Format date in a user-friendly way
  const formatDate = (date) => {
    if (!date) return '';
    
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Get day width based on current timeScale
  const getDayWidth = () => {
    if (timeScale === 'day') return 50;
    if (timeScale === 'week') return 20;
    return 15; // month view
  };

  // Calculate date from pixel position
  const getDateFromPosition = (positionX) => {
    if (!dateRange.start) return null;
    
    const dayWidth = getDayWidth();
    const daysDiff = Math.round(positionX / dayWidth);
    
    const newDate = new Date(dateRange.start);
    newDate.setDate(newDate.getDate() + daysDiff);
    
    return newDate;
  };

  // Handle mouse down on task bar to initiate drag
  const handleTaskMouseDown = (e, task) => {
    e.preventDefault(); // Prevent text selection during drag
    if (!onTaskDrag) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    setDraggedTask(task);
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
    
    // Add event listeners for drag and drop
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };
  
  // Handle mouse move during drag
  const handleMouseMove = (e) => {
    if (!draggedTask || !containerRef.current || !isDragging) return;
    
    e.preventDefault(); // Prevent text selection and other default behaviors
    
    const containerRect = containerRef.current.getBoundingClientRect();
    const newLeft = Math.max(0, e.clientX - containerRect.left - dragOffset.x);
    
    // Calculate new date based on position
    const newDate = getDateFromPosition(newLeft);
    
    // Update dragged task position
    setTaskBars(bars => 
      bars.map(bar => 
        bar.id === draggedTask.id 
          ? { ...bar, position: { ...bar.position, left: newLeft } } 
          : bar
      )
    );
    
    // Update tooltip
    setDragTooltip({
      visible: true,
      date: newDate,
      x: e.clientX,
      y: e.clientY - 40 // Position above cursor
    });
  };
  
  // Handle mouse up to end drag
  const handleMouseUp = (e) => {
    if (!isDragging || !draggedTask || !onTaskDrag || !containerRef.current) {
      setIsDragging(false);
      setDraggedTask(null);
      setDragTooltip({ visible: false, date: null, x: 0, y: 0 });
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      return;
    }
    
    // Calculate the date based on the new position
    const containerRect = containerRef.current.getBoundingClientRect();
    const newLeft = Math.max(0, e.clientX - containerRect.left - dragOffset.x);
    const newDate = getDateFromPosition(newLeft);
    
    if (newDate) {
      // Call the callback with the task id and new date
      onTaskDrag(draggedTask.id, newDate);
    }
    
    // Clean up
    setIsDragging(false);
    setDraggedTask(null);
    setDragTooltip({ visible: false, date: null, x: 0, y: 0 });
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    
    // Update the UI with a small delay to ensure smooth animation
    setTimeout(() => {
      setTaskBars(prevBars => [...prevBars]);
    }, 100);
  };
  
  // Get color based on task status
  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'completed':
        return 'var(--status-completed, #4caf50)';
      case 'in-progress':
      case 'in progress':
        return 'var(--status-in-progress, #2196f3)';
      case 'on-hold':
        return 'var(--status-hold, #ff9800)';
      case 'delayed':
        return 'var(--status-delayed, #f44336)';
      default:
        return 'var(--status-notstarted, #9e9e9e)';
    }
  };
  
  // Get border color based on task priority
  const getPriorityColor = (priority) => {
    switch (priority?.toLowerCase()) {
      case 'high':
        return 'var(--priority-high, #f44336)';
      case 'medium':
        return 'var(--priority-medium, #ff9800)';
      case 'low':
        return 'var(--priority-low, #4caf50)';
      default:
        return 'var(--priority-normal, #9e9e9e)';
    }
  };
  
  return (
    <div className="gantt-visualization" ref={containerRef}>
      {/* Time axis header */}
      <TimeAxis 
        startDate={dateRange.start} 
        endDate={dateRange.end} 
        timeScale={timeScale} 
      />
      
      {/* Task grid and bars */}
      <div className="gantt-grid" ref={gridRef}>
        {taskBars.filter(task => task.visible).map((task) => (
          <div
            key={task.id}
            className={`gantt-task-bar ${isDragging && draggedTask?.id === task.id ? 'dragging' : ''}`}
            style={{
              left: `${task.position.left}px`,
              top: `${task.position.top}px`,
              width: `${task.position.width}px`,
              height: `${task.position.height}px`,
              backgroundColor: getStatusColor(task.status),
              borderLeft: `4px solid ${getPriorityColor(task.priority)}`,
              cursor: onTaskDrag ? 'grab' : 'pointer'
            }}
            onClick={(e) => {
              if (!isDragging && onTaskClick) {
                onTaskClick(task);
              }
            }}
            onMouseDown={(e) => handleTaskMouseDown(e, task)}
            title={`${task.text || task.title} (${task.progress || 0}% complete)`}
          >
            <div className="task-progress-bar" style={{ width: `${task.progress || 0}%` }}></div>
            <div className="task-title">{task.text || task.title}</div>
          </div>
        ))}
      </div>
      
      {/* Tooltip that shows date when dragging */}
      {dragTooltip.visible && draggedTask && (
        <div className="drag-tooltip" style={{ 
          position: 'fixed', 
          left: `${dragTooltip.x}px`, 
          top: `${dragTooltip.y}px` 
        }}>
          {`Move to: ${formatDate(dragTooltip.date)}`}
        </div>
      )}
    </div>
  );
};

export default GanttVisualization; 