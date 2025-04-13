// Data for GenEd requirements completion
export const genEdRequirements = [
  {
    label: 'Completed',
    value: 68,
    color: '#4caf50'
  },
  {
    label: 'In Progress',
    value: 20,
    color: '#ff9800'
  },
  {
    label: 'Remaining',
    value: 12,
    color: '#f44336'
  }
];

// Data for CS major requirements completion
export const csRequirements = [
  {
    label: 'Completed',
    value: 52,
    color: '#4caf50'
  },
  {
    label: 'In Progress',
    value: 30,
    color: '#ff9800'
  },
  {
    label: 'Remaining',
    value: 18,
    color: '#f44336'
  }
];

// Optional: Data for specific requirement categories
export const genEdCategories = [
  {
    label: 'FSAW',
    value: 100,
    color: '#81c784'
  },
  {
    label: 'FSMA',
    value: 100,
    color: '#81c784'
  },
  {
    label: 'FSOC',
    value: 100,
    color: '#81c784'
  },
  {
    label: 'DSHS',
    value: 100,
    color: '#81c784'
  },
  {
    label: 'DSHU',
    value: 50,
    color: '#ffb74d'
  },
  {
    label: 'DSSP',
    value: 0,
    color: '#e57373'
  },
  {
    label: 'DVUP',
    value: 50,
    color: '#ffb74d'
  }
];

export const csCategories = [
  {
    label: 'Lower Level',
    value: 100,
    color: '#81c784'
  },
  {
    label: 'Upper Level Core',
    value: 75,
    color: '#aed581'
  },
  {
    label: 'Specialization',
    value: 33,
    color: '#ffb74d'
  },
  {
    label: 'Electives',
    value: 20,
    color: '#e57373'
  }
];

export const valueFormatter = (item: { value: number }) => `${item.value}%`; 