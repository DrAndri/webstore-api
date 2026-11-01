import cron from 'node-cron';
import { CronDescription } from './types';

// Validates with the same node-cron version as the scraper, which runs the
// schedules in UTC
export const describeCron = (expression: string, runs = 5): CronDescription => {
  const validation = cron.validateDetailed(expression);
  if (!validation.valid)
    return {
      valid: false,
      errors: validation.errors.map((e) => e.message),
      nextRuns: []
    };
  const task = cron.createTask(expression, () => undefined, {
    timezone: 'UTC'
  });
  try {
    return {
      valid: true,
      errors: [],
      nextRuns: task.getNextRuns(runs).map((date) => date.toISOString())
    };
  } finally {
    void task.destroy();
  }
};
