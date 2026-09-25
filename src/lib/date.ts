export const getTodayDate = (date: Date = new Date()): string => {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(date);
};
