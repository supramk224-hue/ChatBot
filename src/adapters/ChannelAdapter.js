export class ChannelAdapter {
  constructor(engine, channelId) {
    if (!engine) {
      throw new TypeError('ChannelAdapter requires a bot engine.');
    }
    this.engine = engine;
    this.channelId = channelId;
  }

  processActivity(activity) {
    return this.engine.process({
      ...activity,
      channelId: activity.channelId || this.channelId,
    });
  }
}
