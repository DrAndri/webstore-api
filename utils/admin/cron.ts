import { TFunction } from 'i18next';
import cron from 'node-cron';
import { CronDescription } from './types';

const CRON_FIELDS = [
  'second',
  'minute',
  'hour',
  'dayOfMonth',
  'month',
  'dayOfWeek'
] as const;
type CronField = (typeof CRON_FIELDS)[number];

// node-cron's validation errors in the language of t, its own message when
// the error is not one of these
const describeError = (
  error: { field: string; value?: string; message: string },
  t: TFunction<'admin'>
) => {
  const fieldCount = /^expected 5 or 6 fields but got (\d+)/.exec(
    error.message
  );
  if (fieldCount) return t('cron.fieldCount', { fields: fieldCount[1] });
  if (error.message.startsWith('pattern includes illegal characters'))
    return t('cron.illegalCharacters');
  if (error.value === undefined) return error.message;
  if (error.message.includes('impossible day of month'))
    return t('cron.impossibleDay', { value: error.message.split(' is ')[0] });
  if (
    error.message.includes('invalid expression for') &&
    CRON_FIELDS.includes(error.field as CronField)
  )
    return t('cron.invalidField', {
      value: error.value,
      field: t(`cron.fields.${error.field as CronField}`)
    });
  return error.message;
};

// Validates with the same node-cron version as the scraper, which runs the
// schedules in UTC. The errors are in the language of t.
export const describeCron = (
  expression: string,
  t: TFunction<'admin'>,
  runs = 5
): CronDescription => {
  const validation = cron.validateDetailed(expression);
  if (!validation.valid)
    return {
      valid: false,
      errors: validation.errors.map((e) => describeError(e, t)),
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
