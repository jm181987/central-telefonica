import 'dotenv/config';
function required(name:string):string {
  const value=process.env[name];
  if(!value) throw new Error('Missing required environment variable: '+name);
  return value;
}
export const config={
  port:Number(process.env.PORT||3000),
  pg:{host:process.env.POSTGRES_HOST||'postgres',port:Number(process.env.POSTGRES_PORT||5432),database:required('POSTGRES_DB'),user:required('POSTGRES_USER'),password:required('POSTGRES_PASSWORD')},
  redisUrl:process.env.REDIS_URL||'redis://redis:6379',
  jwtSecret:required('JWT_SECRET'),
  ari:{url:process.env.ARI_URL||'http://asterisk:8088',username:process.env.ARI_USERNAME||'pbxapi',password:required('ARI_PASSWORD'),app:process.env.ARI_APP||'central-telefonica'},
  ami:{host:process.env.AMI_HOST||'asterisk',port:Number(process.env.AMI_PORT||5038),username:process.env.AMI_USERNAME||'pbxami',password:required('AMI_PASSWORD')},
  vono:{host:required('VONO_HOST'),port:Number(process.env.VONO_PORT||5060),username:required('VONO_USERNAME')}
};
