import 'dotenv/config';

function must(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export const env = {
  port: Number(process.env.PORT ?? 3000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  frontendOrigin: must('FRONTEND_ORIGIN'),
  databaseUrl: must('DATABASE_URL'),
  cookieName: must('COOKIE_NAME'),
  cookieSecret: must('COOKIE_SECRET'),
};


