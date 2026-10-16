export type RedisConfig = {
  host: string;
  port: number;
};

const nonEmpty = (value: string | undefined, fallback: string): string => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
};

export const getRedisConfig = (): RedisConfig => {
  const host = nonEmpty(process.env.REDIS_HOST, 'localhost');
  const rawPort = nonEmpty(process.env.REDIS_PORT, '6379');
  const port = Number(rawPort);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid REDIS_PORT: ${rawPort}`);
  }

  return { host, port };
};
