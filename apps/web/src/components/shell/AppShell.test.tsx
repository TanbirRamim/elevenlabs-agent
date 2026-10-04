// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/map/latest",
  useRouter: () => ({ push }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { AppShell } from "./AppShell";
import { TopBarActions } from "./slots";

beforeEach(() => {
  push.mockReset();
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
});
afterEach(cleanup);

describe("AppShell", () => {
  it("renders product nav with the current section marked", () => {
    render(
      <AppShell>
        <p>Page body</p>
      </AppShell>,
    );
    const nav = screen.getAllByRole("navigation", { name: "Product" })[0];
    expect(nav).toBeTruthy();
    const current = screen.getAllByRole("link", { name: /Work Maps/ })[0];
    expect(current?.getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("navigation", { name: "Breadcrumb" }).textContent).toContain("Latest");
    expect(screen.getByText("Page body")).toBeTruthy();
  });

  it("portals page actions into the top bar", () => {
    render(
      <AppShell>
        <TopBarActions>
          <button type="button">Publish</button>
        </TopBarActions>
      </AppShell>,
    );
    const publish = screen.getByRole("button", { name: "Publish" });
    expect(publish.closest(".sticky")).toBeTruthy();
  });

  it("navigates with G then C", () => {
    render(
      <AppShell>
        <p>Body</p>
      </AppShell>,
    );
    act(() => {
      fireEvent.keyDown(window, { key: "g" });
      fireEvent.keyDown(window, { key: "c" });
    });
    expect(push).toHaveBeenCalledWith("/capture");
  });
});
