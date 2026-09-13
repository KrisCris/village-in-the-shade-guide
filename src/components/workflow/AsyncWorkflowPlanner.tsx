import { useEffect, useState } from "react";
import type { Entity } from "../../data/types";
import { withBase } from "../../lib/sitePath";
import WorkflowEditor from "./WorkflowEditor";
export default function AsyncWorkflowPlanner() {
  const [entities, setEntities] = useState<Entity[] | null>(null),
    [error, setError] = useState(false),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    fetch(withBase("/workflow-data.json"), { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error("load");
        return r.json();
      })
      .then((data) => {
        if (!Array.isArray(data)) throw new Error("format");
        setEntities(data);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(true);
      });
    return () => controller.abort();
  }, [attempt]);
  return entities ? (
    <WorkflowEditor entities={entities} />
  ) : (
    <div className="wf-loading" role="status">
      {error ? (
        <>
          <p>生产数据加载失败</p>
          <button onClick={() => setAttempt((n) => n + 1)}>重试</button>
        </>
      ) : (
        "正在加载作物、加工配方与留货目录…"
      )}
    </div>
  );
}
