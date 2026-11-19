import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContactForm } from "@/components/public/forms";
import { SectionList } from "@/components/public/sections";
import { VehicleCard } from "@/components/public/VehicleCard";
import { Button, EmptyState, ToastProvider } from "@/components/ui";
import { DataTable } from "@/components/ui/DataTable";
import { SiteProvider } from "@/features/site";
import { distance, hexToRgbTriplet, money, monthlyPayment } from "@/services/format";
import type { Vehicle } from "@/services/types";

const site = { theme: { primaryColor: "#0f172a", secondaryColor: "#1e293b", accentColor: "#c8a45c", headingFont: "Lora", bodyFont: "Inter", buttonRadius: "0.25rem", layoutWidth: "1280px" }, settings: { general: { dealershipName: "Test Motors", currency: "CAD", units: "metric", locale: "en-CA" }, contact: {}, hours: {}, social: {}, seo: {}, footer: {} }, navigation: { header: [], footer: [] }, banners: [], categories: [], mapsKey: null };

const vehicle = (o: Partial<Vehicle> = {}): Vehicle => ({ id: "1", slug: "2022-audi-q5", stockNumber: "A1", title: "2022 Audi Q5", makeName: "Audi", modelName: "Q5", year: 2022, price: 54900, mileage: 31200, condition: "USED", fuelType: "Gasoline", transmission: "Automatic", status: "AVAILABLE", publishStatus: "PUBLISHED", isFeatured: false, isNewArrival: false, primaryImage: "/x.png", images: [], features: [], updatedAt: "", ...o }) as Vehicle;

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<HelmetProvider><QueryClientProvider client={qc}><ToastProvider><SiteProvider><MemoryRouter>{ui}</MemoryRouter></SiteProvider></ToastProvider></QueryClientProvider></HelmetProvider>);
}

let fetchMock: ReturnType<typeof vi.fn>;
const json = (data: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(status < 400 ? { success: true, data } : { success: false, error: { code: "X", message: String(data) } }), { status, headers: { "content-type": "application/json" } }));
beforeEach(() => {
  fetchMock = vi.fn((url: string) => (String(url).includes("/public/site") ? json(site) : json([])));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("format helpers", () => {
  it("formats CAD currency and metric/imperial distances", () => {
    expect(money(54900)).toMatch(/54,900/);
    expect(distance(1000, "metric")).toBe("1,000 km");
    expect(distance(1000, "imperial")).toMatch(/621 mi/);
    expect(distance(null)).toBe("—");
  });
  it("converts hex colours for the theme system", () => expect(hexToRgbTriplet("#c8a45c")).toBe("200 164 92"));
  it("computes an amortised payment (and handles 0% APR)", () => {
    expect(monthlyPayment(60000, 0, 60)).toBe(1000);
    expect(monthlyPayment(30000, 6, 60)).toBeCloseTo(579.98, 1);
  });
});

describe("UI primitives", () => {
  it("Button shows a loading state and disables itself", () => {
    render(<Button loading>Save</Button>);
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
  });
  it("EmptyState renders title and description", () => {
    render(<EmptyState title="Nothing" description="Add something" />);
    expect(screen.getByText("Nothing")).toBeInTheDocument();
  });
  it("DataTable shows loading skeletons, rows, and an empty state", () => {
    const cols = [{ key: "n", header: "Name", cell: (r: { id: string; n: string }) => r.n }];
    const { rerender } = render(<DataTable columns={cols} rows={[{ id: "1", n: "Alpha" }]} />);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    rerender(<DataTable columns={cols} rows={[]} emptyTitle="No rows" />);
    expect(screen.getByText("No rows")).toBeInTheDocument();
    rerender(<DataTable columns={cols} error={new Error("boom")} />);
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
  });
  it("DataTable selection reports chosen ids", () => {
    const onSelect = vi.fn();
    render(<DataTable columns={[{ key: "n", header: "N", cell: (r: { id: string }) => r.id }]} rows={[{ id: "a" }, { id: "b" }]} selectable selected={[]} onSelect={onSelect} />);
    fireEvent.click(screen.getByLabelText("Select all"));
    expect(onSelect).toHaveBeenCalledWith(["a", "b"]);
  });
});

describe("VehicleCard", () => {
  it("shows price, mileage in km, and badges", async () => {
    wrap(<VehicleCard v={vehicle({ isFeatured: true, isNewArrival: true })} />);
    expect(await screen.findByText("2022 Audi Q5")).toBeInTheDocument();
    expect(screen.getByText(/54,900/)).toBeInTheDocument();
    expect(screen.getByText(/31,200 km/)).toBeInTheDocument();
    expect(screen.getByText("Featured")).toBeInTheDocument();
    expect(screen.getByText("New Arrival")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/inventory/2022-audi-q5");
  });
  it("marks sold vehicles and strikes through the original price when discounted", async () => {
    wrap(<VehicleCard v={vehicle({ status: "SOLD", salePrice: 50000 })} />);
    expect(await screen.findByText("Sold")).toBeInTheDocument();
    expect(screen.queryByText("New Arrival")).not.toBeInTheDocument();
    expect(screen.getByText(/50,000/)).toBeInTheDocument();
    expect(screen.getByText(/54,900/)).toHaveClass("line-through");
  });
});

describe("CMS section renderer", () => {
  it("renders sections from database-style content and skips hidden ones", async () => {
    wrap(<SectionList sections={[
      { id: "1", type: "rich-text", position: 0, isVisible: true, content: { heading: "About us", html: "<p>Hello <b>world</b></p>" } },
      { id: "2", type: "rich-text", position: 1, isVisible: false, content: { heading: "Secret", html: "<p>hidden</p>" } },
    ]} />);
    expect(await screen.findByText("About us")).toBeInTheDocument();
    expect(screen.queryByText("Secret")).not.toBeInTheDocument();
  });
  it("does not crash on unknown or invalid section content", async () => {
    wrap(<><SectionList sections={[{ id: "1", type: "unknown-type", position: 0, isVisible: true, content: {} }, { id: "2", type: "hero", position: 1, isVisible: true, content: { nope: true } }, { id: "3", type: "rich-text", position: 2, isVisible: true, content: { html: "<p>still here</p>" } }]} /></>);
    expect(await screen.findByText("still here")).toBeInTheDocument();
  });
  it("strips script tags and inline handlers from rich text", async () => {
    wrap(<SectionList sections={[{ id: "1", type: "rich-text", position: 0, isVisible: true, content: { html: '<p onclick="x()">safe</p><script>window.__pwned=1</script><a href="javascript:alert(1)">l</a>' } }]} />);
    const p = await screen.findByText("safe");
    expect(p).not.toHaveAttribute("onclick");
    expect(document.querySelector("script[src], .prose-cms script")).toBeNull();
    expect(document.querySelector('a[href^="javascript"]')).toBeNull();
  });
});

describe("ContactForm", () => {
  it("shows validation errors and does not call the API when invalid", async () => {
    wrap(<ContactForm />);
    fireEvent.click(await screen.findByRole("button", { name: /send message/i }));
    expect(await screen.findAllByRole("alert")).not.toHaveLength(0);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/public/leads"))).toBe(false);
  });
  it("submits valid data to the leads API and shows a success state", async () => {
    fetchMock.mockImplementation((url: string) => (String(url).includes("/public/leads/general") ? json({ id: "L1" }, 201) : String(url).includes("/public/site") ? json(site) : json([])));
    wrap(<ContactForm />);
    const set = async (label: RegExp, v: string) => fireEvent.change(await screen.findByLabelText(label), { target: { value: v } });
    await set(/first name/i, "Jane"); await set(/last name/i, "Doe"); await set(/^email/i, "jane@example.com"); await set(/message/i, "Is the Q5 still available?");
    fireEvent.click(screen.getByRole("button", { name: /send message/i }));
    expect(await screen.findByText("Message sent")).toBeInTheDocument();
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes("/public/leads/general"))!;
    expect(JSON.parse((call[1] as RequestInit).body as string)).toMatchObject({ firstName: "Jane", email: "jane@example.com" });
  });
  it("shows a server error without losing the form", async () => {
    fetchMock.mockImplementation((url: string) => (String(url).includes("/public/leads/general") ? json("Too many submissions", 429) : String(url).includes("/public/site") ? json(site) : json([])));
    wrap(<ContactForm />);
    const set = async (label: RegExp, v: string) => fireEvent.change(await screen.findByLabelText(label), { target: { value: v } });
    await set(/first name/i, "Jane"); await set(/last name/i, "Doe"); await set(/^email/i, "jane@example.com"); await set(/message/i, "Hello there friend");
    fireEvent.click(screen.getByRole("button", { name: /send message/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Too many submissions"));
    expect(screen.getByRole("button", { name: /send message/i })).toBeInTheDocument();
  });
});
