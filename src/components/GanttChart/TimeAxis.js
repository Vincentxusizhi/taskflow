import React from 'react';
import './TimeAxis.css';

const TimeAxis = ({ startDate, endDate, timeScale }) => {
  if (!startDate || !endDate) {
    return <div className="gantt-time-axis">Loading time axis...</div>;
  }

  // Function to generate the appropriate time labels based on the scale
  const generateTimeLabels = () => {
    const labels = [];
    const currentDate = new Date(startDate);
    
    // Ensure dates are proper Date objects
    const start = new Date(startDate);
    const end = new Date(endDate);
    // Add one day to include the end date
    end.setDate(end.getDate() + 1);
    
    if (timeScale === 'day') {
      // For daily view, show each day
      while (currentDate < end) {
        labels.push({
          date: new Date(currentDate),
          label: currentDate.getDate().toString(),
          isWeekend: [0, 6].includes(currentDate.getDay()),
          isFirstOfMonth: currentDate.getDate() === 1,
          month: currentDate.toLocaleString('default', { month: 'short' }),
          year: currentDate.getFullYear()
        });
        currentDate.setDate(currentDate.getDate() + 1);
      }
    } else if (timeScale === 'week') {
      // For weekly view, show each week
      // Adjust to start from Monday
      const dayOfWeek = currentDate.getDay();
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // If Sunday (0), go back 6 days, otherwise go back dayOfWeek - 1
      currentDate.setDate(currentDate.getDate() - diff);
      
      while (currentDate < end) {
        const weekStart = new Date(currentDate);
        const weekEnd = new Date(currentDate);
        weekEnd.setDate(weekStart.getDate() + 6);
        
        labels.push({
          date: new Date(weekStart),
          endDate: new Date(weekEnd),
          label: `${weekStart.getDate()} - ${weekEnd.getDate()}`,
          month: weekStart.toLocaleString('default', { month: 'short' }),
          year: weekStart.getFullYear(),
          isNewMonth: weekStart.getDate() <= 7, // First week of month
          spansTwoMonths: weekStart.getMonth() !== weekEnd.getMonth()
        });
        
        // Move to next week
        currentDate.setDate(currentDate.getDate() + 7);
      }
    } else if (timeScale === 'month') {
      // For monthly view, show each month
      // Adjust to start from first day of month
      currentDate.setDate(1);
      
      while (currentDate < end) {
        const monthStart = new Date(currentDate);
        const monthName = monthStart.toLocaleString('default', { month: 'short' });
        const year = monthStart.getFullYear();
        
        // Calculate days in month for width
        const daysInMonth = new Date(year, monthStart.getMonth() + 1, 0).getDate();
        
        labels.push({
          date: new Date(monthStart),
          label: monthName,
          year: year,
          daysInMonth: daysInMonth,
          isNewYear: monthStart.getMonth() === 0 // January
        });
        
        // Move to next month
        currentDate.setMonth(currentDate.getMonth() + 1);
      }
    }
    
    return labels;
  };

  const timeLabels = generateTimeLabels();

  // Calculate variable CSS properties based on timeScale
  let dayWidth = timeScale === 'day' ? 50 : timeScale === 'week' ? 20 : 15;
  
  // Helper function to get grid column span for month headers in day view
  const getMonthColSpan = (month, year, labels) => {
    return labels.filter(l => 
      l.month === month && l.year === year
    ).length;
  };
  
  return (
    <div className="gantt-time-axis">
      <div className="time-labels">
        {timeScale === 'day' && (
          <>
            {/* Month labels for day view */}
            <div className="month-labels" style={{ '--day-width': `${dayWidth}px` }}>
              {timeLabels
                .filter(label => label.isFirstOfMonth || label === timeLabels[0])
                .map((label, index) => {
                  const monthColSpan = getMonthColSpan(label.month, label.year, timeLabels);
                  const startPos = timeLabels.findIndex(l => 
                    l.date.getMonth() === label.date.getMonth() && 
                    l.date.getFullYear() === label.date.getFullYear()
                  );
                  
                  return (
                    <div 
                      key={`month-${index}`} 
                      className="month-label"
                      style={{ 
                        gridColumnStart: startPos + 1,
                        gridColumnEnd: `span ${monthColSpan}`,
                        borderBottom: label.isNewYear ? '2px solid #1976d2' : undefined,
                      }}
                    >
                      {`${label.month} ${label.year}`}
                    </div>
                  );
                })}
            </div>
            
            {/* Day labels */}
            <div className="day-labels" style={{ '--day-width': `${dayWidth}px` }}>
              {timeLabels.map((label, index) => (
                <div 
                  key={`day-${index}`} 
                  className={`day-label ${label.isWeekend ? 'weekend' : ''} ${label.isFirstOfMonth ? 'first-of-month' : ''}`}
                >
                  {label.label}
                </div>
              ))}
            </div>
          </>
        )}
        
        {timeScale === 'week' && (
          <div className="week-labels" style={{ '--week-width': `${dayWidth * 7}px` }}>
            {timeLabels.map((label, index) => (
              <div 
                key={`week-${index}`} 
                className={`week-label ${label.isNewMonth ? 'new-month' : ''} ${label.spansTwoMonths ? 'spans-two-months' : ''}`}
              >
                <span className="week-date">{label.label}</span>
                <span className="week-month">
                  {label.spansTwoMonths 
                    ? `${label.month} / ${label.endDate.toLocaleString('default', { month: 'short' })}`
                    : `${label.month} ${label.year}`
                  }
                </span>
              </div>
            ))}
          </div>
        )}
        
        {timeScale === 'month' && (
          <div className="month-labels" style={{ '--month-width': `${dayWidth * 30}px` }}>
            {timeLabels.map((label, index) => (
              <div 
                key={`month-${index}`} 
                className={`month-label ${label.isNewYear ? 'new-year' : ''}`}
                style={{ 
                  gridColumnEnd: `span ${label.daysInMonth}`,
                  borderBottom: label.isNewYear ? '2px solid #1976d2' : undefined,
                }}
              >
                <span>{label.label}</span>
                <span className="month-year">{label.year}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TimeAxis; 