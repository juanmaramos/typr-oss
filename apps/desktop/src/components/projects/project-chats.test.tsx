// @vitest-environment jsdom
import { messages } from "@/locales/en/messages.po";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import type { AskThread } from "@typr/plugin-db";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectNotesPanel, type ProjectNotesTab } from "./project-notes-panel";

const db = vi.hoisted(() => ({ listAskThreads: vi.fn(), archiveAskThread: vi.fn() }));
vi.mock("@typr/plugin-db", () => ({ commands: db }));
vi.mock("@/contexts", () => ({ useTypr: () => ({ userId: "user" }) }));
vi.mock("@/components/projects/project-files-dropzone", () => ({ ProjectFilesDropzone: () => <p>Project files</p> }));
vi.mock("@/lib/project-files", () => ({
  projectFileQueryKeys: { list: "files", extractions: "extractions" },
  listProjectFiles: async () => [],
  listProjectFileExtractions: async () => [],
  addProjectFiles: vi.fn(),
  deleteProjectFile: vi.fn(),
  retryProjectFileExtraction: vi.fn(),
}));
vi.mock("@/lib/project-knowledge-jobs", () => ({
  markAndEnqueueProjectBriefRefresh: vi.fn(),
  projectKnowledgeJobQueryKeys: { byProject: "jobs" },
}));
vi.mock("@/utils/analytics-events", () => ({ trackEvent: vi.fn() }));
vi.mock("@typr/ui/components/ui/toast", () => ({ toast: vi.fn() }));

const makeThread = (id: string, projectId: string): AskThread => ({
  id,
  user_id: "user",
  scope_type: "Project",
  scope_id: projectId,
  title: `Chat ${id}`,
  created_at: "2026-10-01T12:00:00Z",
  updated_at: "2026-10-01T12:00:00Z",
  last_message_at: null,
  archived_at: null,
});
let threads: AskThread[];
let root: Root;
let container: HTMLDivElement;
let client: QueryClient;

function setup(initial = "/app/projects/alpha") {
  const rootRoute = createRootRoute({ component: Outlet });
  const projectRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/app/projects/$projectId",
    validateSearch: (search: Record<string, unknown>) => ({ tab: search.tab as ProjectNotesTab | undefined }),
    component: () => {
      const { projectId } = projectRoute.useParams();
      const { tab } = projectRoute.useSearch();
      const navigate = projectRoute.useNavigate();
      return (
        <ProjectNotesPanel
          key={projectId}
          projectId={projectId}
          count={1}
          onAddNotes={() => {}}
          selectedTab={tab}
          onTabChange={tab => navigate({ search: { tab }, replace: true })}
        >
          <p>Project notes</p>
        </ProjectNotesPanel>
      );
    },
  });
  const chatRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/app/projects/$projectId/chats/$threadId",
    component: () => {
      const { projectId, threadId } = chatRoute.useParams();
      const navigate = chatRoute.useNavigate();
      return (
        <div>
          <h1>Conversation {threadId}</h1>
          <button
            onClick={() =>
              navigate({
                to: "/app/projects/$projectId",
                params: { projectId },
                search: { tab: "chats" },
              })}
          >
            Back to project chats
          </button>
        </div>
      );
    },
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([projectRoute, chatRoute]),
    history: createMemoryHistory({ initialEntries: [initial] }),
  });
  return {
    router,
    render: () =>
      act(async () => {
        root.render(
          <I18nProvider i18n={i18n}>
            <QueryClientProvider client={client}>
              <RouterProvider router={router} />
            </QueryClientProvider>
          </I18nProvider>,
        );
        await router.load();
        await new Promise(resolve => setTimeout(resolve, 10));
      }),
  };
}
const click = async (text: string) => {
  const button = [...container.querySelectorAll("button")].find(button => button.textContent?.trim() === text);
  expect(button, text).toBeTruthy();
  await act(async () => {
    button!.click();
    await new Promise(resolve => setTimeout(resolve, 10));
  });
};

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  i18n.load("en", messages);
  i18n.activate("en");
  threads = [makeThread("alpha-one", "alpha"), makeThread("beta-one", "beta")];
  db.listAskThreads.mockReset().mockImplementation(async (_user, scope, id) =>
    threads.filter(thread =>
      !thread.archived_at && (!scope || thread.scope_type === scope) && (!id || thread.scope_id === id)
    )
  );
  db.archiveAskThread.mockReset().mockImplementation(async (id: string) => {
    threads = threads.filter(thread => thread.id !== id);
  });
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
  vi.unstubAllGlobals();
});

describe("project-owned chat history", () => {
  it("keeps Notes and Files and resumes a project chat through its project URL", async () => {
    const app = setup();
    await app.render();
    await vi.waitFor(() => expect(container.textContent).toContain("Project notes"));
    await click("Files0");
    expect(container.textContent).toContain("Project files");
    await click("Chats1");
    await vi.waitFor(() => expect(container.textContent).toContain("Chat alpha-one"));
    expect(container.textContent).not.toContain("Chat beta-one");
    expect(db.listAskThreads).toHaveBeenCalledWith("user", "Project", "alpha");
    const link = container.querySelector<HTMLAnchorElement>("a[href=\"/app/projects/alpha/chats/alpha-one\"]");
    expect(link).toBeTruthy();
    await act(async () => link!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })));
    await vi.waitFor(() => expect(container.textContent).toContain("Conversation alpha-one"));
    await click("Back to project chats");
    await vi.waitFor(() => expect(container.textContent).toContain("Chat alpha-one"));
    expect(app.router.state.location.search).toMatchObject({ tab: "chats" });
  });

  it("does not reuse another project's cached history when switching projects", async () => {
    const app = setup("/app/projects/alpha?tab=chats");
    await app.render();
    await vi.waitFor(() => expect(container.textContent).toContain("Chat alpha-one"));
    await act(async () => {
      await app.router.navigate({
        to: "/app/projects/$projectId",
        params: { projectId: "beta" },
        search: { tab: "chats" },
      });
    });
    await vi.waitFor(() => expect(container.textContent).toContain("Chat beta-one"));
    expect(container.textContent).not.toContain("Chat alpha-one");
    expect(db.listAskThreads).toHaveBeenCalledWith("user", "Project", "beta");
  });

  it("archives a chat, refreshes its count, and keeps other project chats", async () => {
    const app = setup("/app/projects/alpha?tab=chats");
    await app.render();
    await vi.waitFor(() => expect(container.textContent).toContain("Chat alpha-one"));
    await act(async () =>
      container.querySelector<HTMLButtonElement>("[aria-label=\"Archive Chat alpha-one\"]")!.click()
    );
    await vi.waitFor(() => expect(container.textContent).toContain("No project chats yet"));
    expect(db.archiveAskThread).toHaveBeenCalledWith("alpha-one");
    expect(threads.map(thread => thread.id)).toEqual(["beta-one"]);
    expect(container.textContent).toContain("Chats0");
  });

  it("shows a recoverable loading error and retries without losing the project scope", async () => {
    db.listAskThreads.mockRejectedValueOnce(new Error("offline"));
    const app = setup("/app/projects/alpha?tab=chats");
    await app.render();
    await vi.waitFor(() => expect(container.textContent).toContain("Couldn’t load project chats."));
    await click("Try again");
    await vi.waitFor(() => expect(container.textContent).toContain("Chat alpha-one"));
    expect(container.textContent).not.toContain("Chat beta-one");
  });
});
