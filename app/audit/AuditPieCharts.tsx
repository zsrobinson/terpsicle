"use client";

import * as React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { PieChart } from '@mui/x-charts/PieChart';
import { genEdRequirements, csRequirements, valueFormatter } from './auditStats';

export default function AuditPieCharts() {
  return (
    <div className="flex flex-col md:flex-row gap-4 my-4">
      <Box sx={{ width: '100%', maxWidth: 300, margin: '0 auto' }}>
        <Typography variant="h6" align="center" gutterBottom>
          GenEd Requirements
        </Typography>
        <PieChart
          height={300}
          series={[
            {
              data: genEdRequirements,
              innerRadius: 30,
              outerRadius: 100,
              arcLabel: (item) => `${item.value}%`,
              arcLabelMinAngle: 20,
              highlightScope: { faded: 'global', highlighted: 'item' },
              faded: { innerRadius: 30, additionalRadius: -30, color: 'gray' },
              valueFormatter,
            },
          ]}
          margin={{ top: 0, bottom: 0, left: 20, right: 20 }}
        />
        <div className="flex flex-wrap justify-center gap-3 mt-2">
          {genEdRequirements.map((item) => (
            <div key={item.label} className="flex items-center gap-1">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: item.color }}
              />
              <span className="text-sm">{item.label}</span>
            </div>
          ))}
        </div>
      </Box>
      
      <Box sx={{ width: '100%', maxWidth: 300, margin: '0 auto' }}>
        <Typography variant="h6" align="center" gutterBottom>
          CS Requirements
        </Typography>
        <PieChart
          height={300}
          series={[
            {
              data: csRequirements,
              innerRadius: 30,
              outerRadius: 100,
              arcLabel: (item) => `${item.value}%`,
              arcLabelMinAngle: 20,
              highlightScope: { faded: 'global', highlighted: 'item' },
              faded: { innerRadius: 30, additionalRadius: -30, color: 'gray' },
              valueFormatter,
            },
          ]}
          margin={{ top: 0, bottom: 0, left: 20, right: 20 }}
        />
        <div className="flex flex-wrap justify-center gap-3 mt-2">
          {csRequirements.map((item) => (
            <div key={item.label} className="flex items-center gap-1">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: item.color }}
              />
              <span className="text-sm">{item.label}</span>
            </div>
          ))}
        </div>
      </Box>
    </div>
  );
} 