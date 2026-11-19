import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from "react-router-dom";
import { PageSpinner } from "@/components/ui";
import { RequireAuth } from "@/features/auth";
import { AdminLayout } from "@/layouts/AdminLayout";
import { PublicLayout } from "@/layouts/PublicLayout";
import CmsPage, { NotFound } from "@/pages/public/CmsPage";
import Inventory from "@/pages/public/Inventory";
import VehicleDetail from "@/pages/public/VehicleDetail";
import { BlogList, BlogPost } from "@/pages/public/Blog";

// Admin bundle is lazy-loaded so public visitors never download it.
const lz = <T extends Record<string, any>>(f: () => Promise<T>, k: keyof T) => lazy(async () => ({ default: (await f())[k] as React.ComponentType }));
const Dashboard = lazy(() => import("@/pages/admin/Dashboard"));
const Vehicles = lazy(() => import("@/pages/admin/Vehicles"));
const VehicleEditor = lazy(() => import("@/pages/admin/VehicleEditor"));
const Collections = lazy(() => import("@/pages/admin/Collections"));
const Login = lz(() => import("@/pages/admin/Auth"), "Login");
const ForgotPassword = lz(() => import("@/pages/admin/Auth"), "ForgotPassword");
const ResetPassword = lz(() => import("@/pages/admin/Auth"), "ResetPassword");
const Leads = lz(() => import("@/pages/admin/Leads"), "Leads");
const LeadDetail = lz(() => import("@/pages/admin/Leads"), "LeadDetail");
const Customers = lz(() => import("@/pages/admin/Customers"), "Customers");
const CustomerDetail = lz(() => import("@/pages/admin/Customers"), "CustomerDetail");
const Pages = lz(() => import("@/pages/admin/Pages"), "Pages");
const PageEditor = lz(() => import("@/pages/admin/Pages"), "PageEditor");
const NavigationEditor = lz(() => import("@/pages/admin/ContentMisc"), "NavigationEditor");
const BlogManager = lz(() => import("@/pages/admin/ContentMisc"), "BlogManager");
const MediaLibrary = lz(() => import("@/pages/admin/ContentMisc"), "MediaLibrary");
const Appearance = lz(() => import("@/pages/admin/Config"), "Appearance");
const SettingsPage = lz(() => import("@/pages/admin/Config"), "SettingsPage");
const Users = lz(() => import("@/pages/admin/Config"), "Users");
const AuditLog = lz(() => import("@/pages/admin/Config"), "AuditLog");

const S = ({ children }: { children: React.ReactNode }) => <Suspense fallback={<PageSpinner />}>{children}</Suspense>;
const G = ({ perm, children }: { perm: string[]; children: React.ReactNode }) => <RequireAuth permission={perm}><S>{children}</S></RequireAuth>;

const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { index: true, element: <CmsPage slug="home" /> },
      { path: "inventory", element: <Inventory /> },
      { path: "inventory/:slug", element: <VehicleDetail /> },
      { path: "blog", element: <BlogList /> },
      { path: "blog/:slug", element: <BlogPost /> },
      { path: ":slug", element: <CmsPage /> }, // about, contact, financing, trade-in, faq, services, privacy-policy, terms, custom landing pages
    ],
  },
  { path: "/admin/login", element: <S><Login /></S> },
  { path: "/admin/forgot-password", element: <S><ForgotPassword /></S> },
  { path: "/admin/reset-password", element: <S><ResetPassword /></S> },
  {
    path: "/admin",
    element: <RequireAuth><AdminLayout /></RequireAuth>,
    children: [
      { index: true, element: <G perm={["dashboard:view"]}><Dashboard /></G> },
      { path: "vehicles", element: <G perm={["vehicles:read"]}><Vehicles /></G> },
      { path: "vehicles/new", element: <G perm={["vehicles:write"]}><VehicleEditor /></G> },
      { path: "vehicles/:id", element: <G perm={["vehicles:read"]}><VehicleEditor /></G> },
      { path: "leads", element: <G perm={["leads:read:all", "leads:read:assigned"]}><Leads /></G> },
      { path: "leads/:id", element: <G perm={["leads:read:all", "leads:read:assigned"]}><LeadDetail /></G> },
      { path: "customers", element: <G perm={["customers:read"]}><Customers /></G> },
      { path: "customers/:id", element: <G perm={["customers:read"]}><CustomerDetail /></G> },
      { path: "cms/pages", element: <G perm={["cms:read"]}><Pages /></G> },
      { path: "cms/pages/:id", element: <G perm={["cms:read"]}><PageEditor /></G> },
      { path: "cms/navigation", element: <G perm={["cms:read"]}><NavigationEditor /></G> },
      { path: "cms/blog", element: <G perm={["cms:read"]}><BlogManager /></G> },
      { path: "cms/media", element: <G perm={["cms:read", "media:write"]}><MediaLibrary /></G> },
      { path: "cms/:collection", element: <G perm={["cms:read"]}><Collections /></G> },
      { path: "appearance", element: <G perm={["settings:read"]}><Appearance /></G> },
      { path: "settings", element: <G perm={["settings:read"]}><SettingsPage /></G> },
      { path: "users", element: <G perm={["users:read"]}><Users /></G> },
      { path: "audit", element: <G perm={["audit:read"]}><AuditLog /></G> },
      { path: "*", element: <Navigate to="/admin" replace /> },
    ],
  },
  { path: "*", element: <PublicLayout />, children: [{ path: "*", element: <NotFound /> }] },
]);

export const AppRouter = () => <RouterProvider router={router} />;
export { Outlet };
