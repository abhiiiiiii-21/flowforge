"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import styles from "./WorkflowDashboard.module.css";

type SortOption = "updatedAt" | "createdAt" | "name";
type FilterOption = "projects" | "apps" | "examples" | "templates";

interface WorkflowListItem {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  latestVersion: { id: string; version: number; isPublished: boolean; createdAt: string } | null;
}

export function WorkflowDashboard() {
  const [workflows, setWorkflows] = useState<WorkflowListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("updatedAt");
  const [filter, setFilter] = useState<FilterOption>("projects");

  useEffect(() => {
    const controller = new AbortController();
    const minimumLoaderMs = 450;
    const pauseForLoader = () =>
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, minimumLoaderMs);
      });
    const load = async () => {
      try {
        setLoading(true);
        const qs = new URLSearchParams({
          sort,
          order: "desc",
          ...(search ? { search } : {}),
          filter,
        });
        const res = await fetch(`/api/workflows?${qs.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Failed to load workflows");
        const data = await res.json();
        await pauseForLoader();
        if (controller.signal.aborted) return;
        setWorkflows(data.workflows ?? []);
      } catch {
        await pauseForLoader();
        if (controller.signal.aborted) return;
        setWorkflows([]);
      } finally {
        if (controller.signal.aborted) return;
        setLoading(false);
      }
    };

    void load();
    return () => controller.abort();
  }, [sort, search, filter]);

  const filters = useMemo(
    () => [
      { id: "projects", label: "Projects" },
    ] satisfies Array<{ id: FilterOption; label: string }>,
    [],
  );

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <Image
          src="/dasboard_image.webp"
          alt="Node editor dashboard background"
          fill
          priority
          className={styles.heroImage}
        />
        <div className={styles.heroOverlay} />
        <div className={styles.heroContent}>
          <h1 className={styles.title}>Node Editor</h1>
          <p className={styles.subtitle}>
            Nodes is the most powerful way to operate FlowForge. Connect every tool and model into
            complex automated pipelines.
          </p>
          <Link href="/workflow?new=1" className={styles.newButton}>
            New Workflow <ArrowRight size={14} />
          </Link>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.toolbar}>
          <div className={styles.tabs}>
            {filters.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`${styles.tab} ${filter === item.id ? styles.tabActive : ""}`}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className={styles.actions}>
            <input
              className={styles.search}
              placeholder="Search projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className={styles.select}
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOption)}
            >
              <option value="updatedAt">Last viewed</option>
              <option value="createdAt">Created</option>
              <option value="name">Name</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className={styles.loading} role="status" aria-live="polite">
            <div className={styles.loadingSpinner} />
            <div className={styles.loadingLabel}>Loading workflows…</div>
          </div>
        ) : (
          <>
            <div className={styles.grid}>
              <Link href="/workflow?new=1" className={styles.card}>
                <div className={styles.thumb}>
                  <div className={styles.newThumbIcon}>+</div>
                </div>
                <div className={styles.name}>New Workflow</div>
              </Link>

              {workflows.map((workflow) => (
                <Link key={workflow.id} href={`/workflow?workflowId=${workflow.id}`} className={styles.card}>
                  <div className={styles.thumb}>
                    <Image
                      src="/dasboard_image.webp"
                      alt={workflow.name}
                      width={320}
                      height={180}
                      className={styles.thumbImage}
                    />
                  </div>
                  <div className={styles.name}>{workflow.name || "Untitled"}</div>
                  <div className={styles.meta}>
                    Edited {new Date(workflow.updatedAt).toLocaleString()}
                  </div>
                </Link>
              ))}
            </div>

            {workflows.length === 0 && (
              <p className={styles.empty}>No workflows yet. Create your first one.</p>
            )}
          </>
        )}
      </section>
    </div>
  );
}