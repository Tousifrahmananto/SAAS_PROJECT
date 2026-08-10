import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./App";

afterEach(cleanup);

describe("App", () => {
  it("renders the secure login", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue securely" })).toBeInTheDocument();
  });

  it("opens hospital registration", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Register" }));
    expect(screen.getByRole("heading", { name: "Create your workspace" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create hospital workspace" })).toBeInTheDocument();
    expect(screen.getByLabelText("Hospital name")).toBeInTheDocument();
  });
});
