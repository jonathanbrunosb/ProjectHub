import { describe, it, expect, vi, beforeEach } from 'vitest';

const upload = vi.fn(async (_path: string, _file: File) => ({ error: null as Error | null }));
const remove = vi.fn(async (_paths: string[]) => ({ error: null as Error | null }));
const createSignedUrl = vi.fn(async (_path: string, _expiresIn: number) => (
  { data: { signedUrl: '' }, error: null as Error | null }
));
const insert = vi.fn(async (_payload: Record<string, unknown>) => ({ error: null as Error | null }));
const deleteRow = vi.fn(async (_column: string, _value: string) => ({ error: null as Error | null }));
const storageFrom = vi.fn((_bucket: string) => ({ upload, remove, createSignedUrl }));

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    storage: { from: (bucket: string) => storageFrom(bucket) },
    from: () => ({
      insert: (payload: Record<string, unknown>) => insert(payload),
      delete: () => ({ eq: (column: string, value: string) => deleteRow(column, value) }),
    }),
  },
}));

const {
  uploadAttachment, deleteAttachment, getAttachmentDownloadUrl, MAX_ATTACHMENT_SIZE,
} = await import('../attachments');

function makeFile(name: string, size: number, type: string): File {
  const file = new File([new Uint8Array(size)], name, { type });
  return file;
}

beforeEach(() => {
  upload.mockClear();
  remove.mockClear();
  createSignedUrl.mockClear();
  insert.mockClear();
  deleteRow.mockClear();
  storageFrom.mockClear();
});

describe('uploadAttachment', () => {
  it('rejeita arquivo acima de 50 MB sem chamar o storage', async () => {
    const file = makeFile('grande.pdf', MAX_ATTACHMENT_SIZE + 1, 'application/pdf');
    await expect(uploadAttachment({ projectId: 'p1', entity: 'project', file }))
      .rejects.toThrow(/50 MB/);
    expect(upload).not.toHaveBeenCalled();
  });

  it('rejeita tipo MIME nao permitido', async () => {
    const file = makeFile('script.exe', 100, 'application/x-msdownload');
    await expect(uploadAttachment({ projectId: 'p1', entity: 'project', file }))
      .rejects.toThrow(/nao permitido/);
    expect(upload).not.toHaveBeenCalled();
  });

  it('envia ao storage e grava a linha quando o arquivo e valido', async () => {
    upload.mockResolvedValueOnce({ error: null });
    insert.mockResolvedValueOnce({ error: null });
    const file = makeFile('relatorio.pdf', 1024, 'application/pdf');

    await uploadAttachment({ projectId: 'p1', entity: 'task', entityId: 't1', file });

    expect(storageFrom).toHaveBeenCalledWith('project-files');
    const [path] = upload.mock.calls[0];
    expect(path).toMatch(/^p1\/task\/.+-relatorio\.pdf$/);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      project_id: 'p1', entity: 'task', entity_id: 't1', file_name: 'relatorio.pdf', size_bytes: 1024,
    }));
  });

  it('remove o objeto orfao do storage se o insert da linha falhar', async () => {
    upload.mockResolvedValueOnce({ error: null });
    insert.mockResolvedValueOnce({ error: new Error('RLS negou') });
    const file = makeFile('relatorio.pdf', 1024, 'application/pdf');

    await expect(uploadAttachment({ projectId: 'p1', entity: 'project', file })).rejects.toThrow();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});

describe('deleteAttachment', () => {
  it('apaga a linha e depois o objeto no storage', async () => {
    deleteRow.mockResolvedValueOnce({ error: null });
    remove.mockResolvedValueOnce({ error: null });
    await deleteAttachment('a1', 'p1/project/uuid-arquivo.pdf');
    expect(deleteRow).toHaveBeenCalledWith('id', 'a1');
    expect(remove).toHaveBeenCalledWith(['p1/project/uuid-arquivo.pdf']);
  });
});

describe('getAttachmentDownloadUrl', () => {
  it('gera URL assinada de curta duracao', async () => {
    createSignedUrl.mockResolvedValueOnce({ data: { signedUrl: 'https://signed.example/x' }, error: null });
    const url = await getAttachmentDownloadUrl('p1/project/x.pdf');
    expect(createSignedUrl).toHaveBeenCalledWith('p1/project/x.pdf', 60);
    expect(url).toBe('https://signed.example/x');
  });
});
