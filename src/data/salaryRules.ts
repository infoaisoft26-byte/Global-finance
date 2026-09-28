export const SALARY_RANK_RULES = [
  { code: 'ASST_LEADER', title: 'Asst. Leader', teamBusiness: 5000, salaryPercent: 3, recurringPercent: 0.25, directIds: 1 },
  { code: 'LEADER', title: 'Leader', teamBusiness: 10000, salaryPercent: 4, recurringPercent: 0.25, directIds: 2 },
  { code: 'ASST_MANAGER', title: 'Asst. Manager', teamBusiness: 25000, salaryPercent: 5, recurringPercent: 0.25, directIds: 3 },
  { code: 'MANAGER', title: 'Manager', teamBusiness: 50000, salaryPercent: 6, recurringPercent: 0.25, directIds: 4 },
  { code: 'SENIOR_MANAGER', title: 'Senior Manager', teamBusiness: 100000, salaryPercent: 7, recurringPercent: 0.25, directIds: 5 },
  { code: 'DIRECTOR', title: 'Director', teamBusiness: 250000, salaryPercent: 8, recurringPercent: 0.25, directIds: 6 },
] as const;
