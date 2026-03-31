from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from utils.logger import logger

_scheduler = AsyncIOScheduler()


async def _run_iih_poll() -> None:
    from services.iih.iih_service import iih_service
    logger.info("Counter scheduler: triggering IIH poll")
    try:
        await iih_service.poll_all_equipments()
    except Exception as exc:
        logger.error(f"Counter scheduler error: {exc}")


def start_scheduler() -> None:
    _scheduler.add_job(
        _run_iih_poll,
        trigger=CronTrigger(minute="*"),
        id="iih_counter_poll",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info("Counter scheduler started (every 1 minute)")


def stop_scheduler() -> None:
    if _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Counter scheduler stopped")
