// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button, ButtonLink, buttonClasses } from "./Button";

afterEach(cleanup);

describe("Button", () => {
  it("renders a button that never submits a form by default", () => {
    render(<Button>Start capture</Button>);
    const button = screen.getByRole("button", { name: "Start capture" });
    expect(button.getAttribute("type")).toBe("button");
  });

  it("keeps an explicit type", () => {
    render(<Button type="submit">Save</Button>);
    expect(screen.getByRole("button", { name: "Save" }).getAttribute("type")).toBe("submit");
  });

  it("calls onClick when pressed", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Ask why</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Ask why" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not call onClick when disabled", () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Ask why
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Ask why" });
    expect(button.hasAttribute("disabled")).toBe(true);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("applies variant and size classes and keeps caller classes", () => {
    render(
      <Button variant="secondary" size="lg" className="w-full">
        Open map
      </Button>,
    );
    const cls = screen.getByRole("button", { name: "Open map" }).className;
    expect(cls).toContain("border-rule-strong");
    expect(cls).toContain("min-h-12");
    expect(cls).toContain("w-full");
  });

  it("defaults to the primary variant at medium size", () => {
    const cls = buttonClasses();
    expect(cls).toContain("bg-ink");
    expect(cls).toContain("min-h-11");
  });
});

describe("ButtonLink", () => {
  it("stays a link with an href", () => {
    render(<ButtonLink href="/teach">Coach a new hire</ButtonLink>);
    const link = screen.getByRole("link", { name: "Coach a new hire" });
    expect(link.getAttribute("href")).toBe("/teach");
  });
});
