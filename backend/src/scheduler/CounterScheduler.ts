import cron from 'node-cron';
import { logger } from '../utils/logger';
import { iihService } from '../services/iih/IIHService';

export function startScheduler(): void {
  logger.info('Starting counter scheduler (every minute)');

  cron.schedule('* * * * *', async () => {
    const now = new Date().toISOString();
    logger.info(`Counter scheduler tick at ${now}`);

    try {
      await iihService.pollAllEquipments();
    } catch (err) {
      logger.error(`Counter scheduler error: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  logger.info('Counter scheduler started');
}
