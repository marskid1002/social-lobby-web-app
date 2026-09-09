import { DeleteObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const ONE_YEAR_SECONDS = 31_536_000;

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
};

function value(name: string): string {
  return String(process.env[name] ?? '').trim();
}

export function getR2Config(): R2Config | null {
  const config = {
    accountId: value('R2_ACCOUNT_ID'),
    accessKeyId: value('R2_ACCESS_KEY_ID'),
    secretAccessKey: value('R2_SECRET_ACCESS_KEY'),
    bucket: value('R2_BUCKET_NAME'),
    publicBaseUrl: value('R2_PUBLIC_BASE_URL').replace(/\/+$/, ''),
  };
  if (Object.values(config).some((item) => !item)) return null;

  let publicUrl: URL;
  try { publicUrl = new URL(config.publicBaseUrl); } catch { return null; }
  if (publicUrl.protocol !== 'https:' || publicUrl.username || publicUrl.password || publicUrl.port
      || publicUrl.search || publicUrl.hash || (publicUrl.pathname !== '/' && publicUrl.pathname !== '')) return null;
  if (!/^[a-f0-9]{16,64}$/i.test(config.accountId)) return null;
  if (!/^[A-Za-z0-9._-]{3,63}$/.test(config.bucket)) return null;
  return config;
}

export function isR2Configured(): boolean {
  return getR2Config() !== null;
}

function encodedPath(pathname: string): string {
  return pathname.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

function clientAndConfig(): { client: S3Client; config: R2Config } {
  const config = getR2Config();
  if (!config) throw new Error('R2 is not configured');
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  return { client, config };
}

export async function putR2Object(pathname: string, body: Buffer, contentType: string): Promise<string> {
  const { client, config } = clientAndConfig();
  try {
    await client.send(new PutObjectCommand({
      Bucket: config.bucket,
      Key: pathname,
      Body: body,
      ContentType: contentType,
      CacheControl: `public, max-age=${ONE_YEAR_SECONDS}, immutable`,
    }));
  } finally {
    client.destroy();
  }
  return `${config.publicBaseUrl}/${encodedPath(pathname)}`;
}

export async function deleteR2Object(pathname: string): Promise<void> {
  const { client, config } = clientAndConfig();
  try {
    await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: pathname }));
  } finally {
    client.destroy();
  }
}

export async function probeR2Bucket(): Promise<void> {
  const { client, config } = clientAndConfig();
  try {
    await client.send(new HeadBucketCommand({ Bucket: config.bucket }), { abortSignal: AbortSignal.timeout(5000) });
  } finally { client.destroy(); }
}
