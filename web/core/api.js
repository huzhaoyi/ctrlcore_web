export async function fetchMeta() {
  const resp = await fetch("/api/meta");
  if (!resp.ok) {
    throw new Error(`meta http ${resp.status}`);
  }
  return resp.json();
}

export async function fetchSnapshot() {
  const resp = await fetch("/api/snapshot");
  if (!resp.ok) {
    throw new Error(`snapshot http ${resp.status}`);
  }
  return resp.json();
}

export async function postModule(moduleId, action, body) {
  const resp = await fetch(`/api/modules/${moduleId}/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  return { status: resp.status, data };
}
