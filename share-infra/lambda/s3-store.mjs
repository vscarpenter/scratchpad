// Storage boundary shared by the API and scheduled cleanup. SDK loading is lazy
// so operation tests inject an in-memory store without credentials or network.
const BUCKET = process.env.SHARES_BUCKET;
const PREFIX = 'shares/';
let connection;

async function getS3() {
  if (!connection)
    connection = import('@aws-sdk/client-s3').then((sdk) => ({
      client: new sdk.S3Client({ region: process.env.AWS_REGION }),
      sdk,
    }));
  return connection;
}

export function isMissingObjectError(error) {
  if (!error) return false;
  const status = error.$metadata?.httpStatusCode;
  return error.name === 'NoSuchKey' || error.name === 'AccessDenied' || status === 404 || status === 403;
}

async function read(id, options = {}) {
  const { client, sdk } = await getS3();
  try {
    const result = await client.send(new sdk.GetObjectCommand({ Bucket: BUCKET, Key: PREFIX + id + '.json' }));
    return { value: JSON.parse(await result.Body.transformToString()), etag: result.ETag };
  } catch (error) {
    // The API role deliberately cannot list keys, so missing reads may be 403.
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) return null;
    if (options.allowMissing403 !== false && isMissingObjectError(error)) return null;
    throw error;
  }
}

// Explicit signed headers keep CAS effective even on an older runtime SDK whose
// generated serializer does not yet know the conditional-write input fields.
function conditional(command, name, value) {
  command.middlewareStack.add(
    (next) => async (args) => {
      args.request.headers[name] = value;
      return next(args);
    },
    { step: 'build', name: 'shareStoragePrecondition' },
  );
  return command;
}

async function put(id, value, options = {}) {
  const { client, sdk } = await getS3();
  const command = new sdk.PutObjectCommand({
    Bucket: BUCKET,
    Key: PREFIX + id + '.json',
    ContentType: 'application/json',
    Body: JSON.stringify(value),
    Tagging: 'ttl-days=' + value.ttlDays,
    ...(options.ifMatch ? { IfMatch: options.ifMatch } : { IfNoneMatch: '*' }),
  });
  return client.send(conditional(command, options.ifMatch ? 'if-match' : 'if-none-match', options.ifMatch || '*'));
}

async function remove(id, etag) {
  const { client, sdk } = await getS3();
  const command = new sdk.DeleteObjectCommand({
    Bucket: BUCKET,
    Key: PREFIX + id + '.json',
    ...(etag ? { IfMatch: etag } : {}),
  });
  return client.send(etag ? conditional(command, 'if-match', etag) : command);
}

async function* list() {
  const { client, sdk } = await getS3();
  for await (const page of sdk.paginateListObjectsV2({ client }, { Bucket: BUCKET, Prefix: PREFIX })) {
    for (const object of page.Contents || []) {
      const match = /^shares\/([A-Za-z0-9_-]{12})\.json$/.exec(object.Key || '');
      if (match) yield match[1];
    }
  }
}

export const shareStore = Object.freeze({ read, put, remove, list });
