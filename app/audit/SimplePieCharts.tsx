"use client";

import React from 'react';
import { genEdRequirements, csRequirements } from './auditStats';

// Create a donut chart using CSS
const DonutChart = ({ 
  data, 
  size = 200,
  thickness = 30,
  title
}: { 
  data: typeof genEdRequirements, 
  size?: number,
  thickness?: number,
  title: string
}) => {
  // Calculate the total for percentages
  const total = data.reduce((sum, item) => sum + item.value, 0);
  
  // Generate the CSS conic gradient for the chart
  let cumulativePercentage = 0;
  const gradientStops = data.map(item => {
    const startPercentage = cumulativePercentage;
    cumulativePercentage += (item.value / total) * 100;
    return `${item.color} ${startPercentage}% ${cumulativePercentage}%`;
  }).join(', ');

  const chartStyle = {
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: '50%',
    background: `conic-gradient(${gradientStops})`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative' as const
  };

  const innerCircleStyle = {
    width: `${size - (thickness * 2)}px`,
    height: `${size - (thickness * 2)}px`,
    borderRadius: '50%',
    backgroundColor: 'white',
    position: 'absolute' as const,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  };

  return (
    <div className="flex flex-col items-center">
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <div style={chartStyle} className="mb-4">
        <div style={innerCircleStyle}>
          <span className="text-xl font-bold">
            {Math.round(data[0].value)}%
          </span>
        </div>
      </div>
      
      <div className="flex flex-wrap justify-center gap-3">
        {data.map((item) => (
          <div key={item.label} className="flex items-center gap-1">
            <div 
              className="w-3 h-3 rounded-full" 
              style={{ backgroundColor: item.color }}
            />
            <span className="text-sm">{item.label} ({item.value}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default function SimplePieCharts() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-4">
      <DonutChart 
        data={genEdRequirements} 
        title="GenEd Requirements"
        size={180}
      />
      <DonutChart 
        data={csRequirements} 
        title="CS Requirements"
        size={180}
      />
    </div>
  );
} 