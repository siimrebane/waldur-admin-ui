require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = process.env.PORT || 8000;
const WALDUR_API = (process.env.WALDUR_API_URL || "https://minu.etais.ee/api/").replace(/\/$/, "");
const SESSION_TTL = parseInt(process.env.SESSION_TTL_SECONDS || "3600") * 1000;
const CORS_ORIGINS = (process.env.CORS_ORIGINS || "http://localhost:5173").split(",");
const SESSION_COOKIE = "session_id";

// In-memory sessions: { sessionId: { waldurToken, userUuid, fullName, email, expiresAt } }
const sessions = {};

// --- Middleware ---
app.use(cors({ origin: CORS_ORIGINS, credentials: true }));
app.use(express.json());

// Simple cookie parser (no extra dep)
app.use((req, _res, next) => {
  req.cookies = {};
  const header = req.headers.cookie || "";
  header.split(";").forEach((part) => {
    const [k, ...v] = part.trim().split("=");
    if (k) req.cookies[k.trim()] = decodeURIComponent(v.join("="));
  });
  next();
});

// --- Helpers ---
function waldur(token) {
  return axios.create({
    baseURL: WALDUR_API,
    headers: { Authorization: `Token ${token}` },
  });
}

function getSession(req, res) {
  const id = req.cookies[SESSION_COOKIE];
  if (!id || !sessions[id]) {
    res.status(401).json({ detail: "Not authenticated" });
    return null;
  }
  const session = sessions[id];
  if (Date.now() > session.expiresAt) {
    delete sessions[id];
    res.status(401).json({ detail: "Session expired" });
    return null;
  }
  return session;
}

function setSessionCookie(res, sessionId) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${sessionId}; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL / 1000}; Path=/`
  );
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; Max-Age=0; Path=/`);
}

function paginated(data) {
  return Array.isArray(data) ? data : data.results ?? [];
}

// --- Auth ---
app.post("/auth/login", async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ detail: "Token required" });

  try {
    const { data: user } = await waldur(token).get("/users/me/");
    const sessionId = uuidv4();
    sessions[sessionId] = {
      waldurToken: token,
      userUuid: user.uuid,
      fullName: user.full_name || `${user.first_name || ""} ${user.last_name || ""}`.trim(),
      email: user.email || "",
      expiresAt: Date.now() + SESSION_TTL,
    };
    setSessionCookie(res, sessionId);
    const s = sessions[sessionId];
    res.json({ user_uuid: s.userUuid, full_name: s.fullName, email: s.email });
  } catch {
    res.status(401).json({ detail: "Invalid API token" });
  }
});

app.post("/auth/logout", (req, res) => {
  const id = req.cookies[SESSION_COOKIE];
  if (id) delete sessions[id];
  clearSessionCookie(res);
  res.status(204).send();
});

app.get("/auth/me", (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  res.json({ user_uuid: s.userUuid, full_name: s.fullName, email: s.email });
});

// --- Organizations ---
app.get("/orgs", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  try {
    const { data } = await waldur(s.waldurToken).get("/customers/");
    res.json(paginated(data).map((c) => ({ uuid: c.uuid, name: c.name, projects_count: c.projects_count ?? 0 })));
  } catch (e) {
    res.status(502).json({ detail: "Waldur error" });
  }
});

app.get("/orgs/:uuid", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  try {
    const { data: c } = await waldur(s.waldurToken).get(`/customers/${req.params.uuid}/`);
    res.json({ uuid: c.uuid, name: c.name, description: c.description ?? "", projects_count: c.projects_count ?? 0 });
  } catch {
    res.status(502).json({ detail: "Waldur error" });
  }
});

// --- Projects ---
app.get("/orgs/:orgUuid/projects", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  try {
    const { data } = await waldur(s.waldurToken).get("/projects/", { params: { customer: req.params.orgUuid } });
    res.json(paginated(data).map((p) => ({ uuid: p.uuid, name: p.name, description: p.description ?? "" })));
  } catch {
    res.status(502).json({ detail: "Waldur error" });
  }
});

app.post("/projects", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const { name, org_uuid } = req.body;
  try {
    const { data: p } = await waldur(s.waldurToken).post("/projects/", {
      name,
      customer: `${WALDUR_API}/customers/${org_uuid}/`,
    });
    res.status(201).json({ uuid: p.uuid, name: p.name, description: p.description ?? "" });
  } catch {
    res.status(502).json({ detail: "Waldur error" });
  }
});

app.get("/projects/:uuid", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  try {
    const { data: p } = await waldur(s.waldurToken).get(`/projects/${req.params.uuid}/`);
    res.json({ uuid: p.uuid, name: p.name, description: p.description ?? "" });
  } catch {
    res.status(502).json({ detail: "Waldur error" });
  }
});

// --- Members ---
app.get("/projects/:uuid/members", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  try {
    const { data } = await waldur(s.waldurToken).get(`/projects/${req.params.uuid}/list_users/`);
    res.json(
      paginated(data).map((m) => ({
        user_uuid: m.user_uuid,
        full_name: m.user_full_name ?? "",
        email: m.user_email ?? "",
        role: m.role_name ?? "",
      }))
    );
  } catch {
    res.status(502).json({ detail: "Waldur error" });
  }
});

app.post("/projects/:uuid/members", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const { user_uuid, role } = req.body;
  try {
    await waldur(s.waldurToken).post(`/projects/${req.params.uuid}/add_user/`, { user: user_uuid, role });
    res.status(201).json({ status: "added" });
  } catch {
    res.status(502).json({ detail: "Waldur error" });
  }
});

app.delete("/projects/:uuid/members/:userUuid", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const { role } = req.body;
  try {
    await waldur(s.waldurToken).post(`/projects/${req.params.uuid}/delete_user/`, {
      user: req.params.userUuid,
      role,
    });
    res.status(204).send();
  } catch {
    res.status(502).json({ detail: "Waldur error" });
  }
});

// --- Tenants ---
app.get("/projects/:uuid/tenants", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  try {
    const { data } = await waldur(s.waldurToken).get("/openstack-tenants/", {
      params: { project_uuid: req.params.uuid },
    });
    const tenants = paginated(data);
    if (tenants.length > 0) console.log("RAW QUOTAS:", JSON.stringify(tenants[0].quotas, null, 2));
    res.json(
      tenants.map((t) => ({
        uuid: t.uuid,
        name: t.name,
        state: t.state,
        service_name: t.service_name ?? "",
        marketplace_resource_uuid: t.marketplace_resource_uuid ?? null,
        quotas: (t.quotas || []).filter((q) =>
          ["vcpu", "cores", "ram", "storage"].includes(q.name)
        ).map((q) => ({
          name: q.name,
          limit: q.limit ?? 0,
          usage: q.usage ?? 0,
        })),
      }))
    );
  } catch {
    res.status(502).json({ detail: "Waldur error" });
  }
});

app.get("/projects/:uuid/tenant-offerings", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  try {
    const { data } = await waldur(s.waldurToken).get("/marketplace-public-offerings/", {
      params: { type: "OpenStack.Tenant", state: "Active" },
    });
    res.json(
      paginated(data).map((o) => ({
        uuid: o.uuid,
        url: o.url,
        name: o.name,
        customer_name: o.customer_name ?? "",
        plans: (o.plans || []).map((p) => ({
          uuid: p.uuid,
          url: p.url,
          name: p.name,
          components: (p.components || []).map((c) => ({
            type: c.type,
            name: c.name,
            measured_unit: c.measured_unit,
            price: c.price ?? 0,
          })),
        })),
      }))
    );
  } catch {
    res.status(502).json({ detail: "Waldur error" });
  }
});

app.post("/projects/:uuid/tenants", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const { name, offering_url, plan_url, subnet_cidr, limits } = req.body;
  const projectUrl = `${WALDUR_API}/projects/${req.params.uuid}/`;
  const orderBody = {
    offering: offering_url,
    project: projectUrl,
    attributes: {
      name,
      ...(subnet_cidr ? { subnet_cidr } : {}),
    },
    ...(plan_url ? { plan: plan_url } : {}),
    ...(limits ? { limits: {
      ...limits,
      ...(limits.ram != null ? { ram: limits.ram * 1024 } : {}),
      ...(limits.storage != null ? { storage: limits.storage * 1024 } : {}),
    } } : {}),
  };
  console.log("ORDER BODY:", JSON.stringify(orderBody, null, 2));
  try {
    const { data } = await waldur(s.waldurToken).post("/marketplace-orders/", orderBody);
    res.status(201).json({ uuid: data.uuid, state: data.state });
  } catch (e) {
    const detail = e.response?.data ? JSON.stringify(e.response.data) : "Waldur error";
    res.status(502).json({ detail });
  }
});

// --- Tenant management ---

app.delete("/tenants/:uuid", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  try {
    // Get the tenant to find its marketplace_resource_uuid
    const { data: tenant } = await waldur(s.waldurToken).get(`/openstack-tenants/${req.params.uuid}/`);
    const mrUuid = tenant.marketplace_resource_uuid;
    if (!mrUuid) return res.status(400).json({ detail: "No marketplace resource linked" });
    await waldur(s.waldurToken).post(`/marketplace-resources/${mrUuid}/terminate/`);
    res.json({ status: "terminating" });
  } catch (e) {
    const detail = e.response?.data ? JSON.stringify(e.response.data) : "Waldur error";
    res.status(502).json({ detail });
  }
});

app.patch("/tenants/:uuid/limits", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const { limits } = req.body;
  try {
    const { data: tenant } = await waldur(s.waldurToken).get(`/openstack-tenants/${req.params.uuid}/`);
    const mrUuid = tenant.marketplace_resource_uuid;
    if (!mrUuid) return res.status(400).json({ detail: "No marketplace resource linked" });
    // Normalize keys: vcpu → cores, convert GB → MB for ram/storage
    const converted = { ...limits };
    if (converted.vcpu !== undefined) {
      converted.cores = converted.vcpu;
      delete converted.vcpu;
    }
    if (converted.ram != null) converted.ram = converted.ram * 1024;
    if (converted.storage != null) converted.storage = converted.storage * 1024;
    console.log("UPDATE LIMITS:", JSON.stringify({ limits: converted }, null, 2));
    await waldur(s.waldurToken).post(`/marketplace-resources/${mrUuid}/update_limits/`, { limits: converted });
    res.json({ status: "updating" });
  } catch (e) {
    const detail = e.response?.data ? JSON.stringify(e.response.data) : "Waldur error";
    res.status(502).json({ detail });
  }
});

// --- Costs ---

// Parse "senior-dev-tenant (TalTech Cloud / Default) / CPU" → {resource, component}
function parseItemName(name) {
  const parenIdx = name.indexOf(" (");
  const resource = parenIdx > -1 ? name.substring(0, parenIdx) : name;
  const slashIdx = name.lastIndexOf(" / ");
  const component = slashIdx > -1 ? name.substring(slashIdx + 3) : "";
  return { resource, component };
}

app.get("/projects/:uuid/costs", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  try {
    const { data } = await waldur(s.waldurToken).get("/invoice-items/costs/", {
      params: { project_uuid: req.params.uuid },
    });

    // Build monthly totals for chart (sorted ascending)
    const months = [...data]
      .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)
      .map((m) => ({
        year: m.year,
        month: m.month,
        label: new Date(m.year, m.month - 1).toLocaleString("en", { month: "short", year: "2-digit" }),
        price: parseFloat(m.price || 0),
      }));

    // Current month breakdown — group items by resource
    const latest = data[0];
    let resources = [];
    if (latest?.items?.length) {
      const grouped = {};
      for (const item of latest.items) {
        const { resource, component } = parseItemName(item.name);
        if (!grouped[resource]) grouped[resource] = { name: resource, total: 0, components: [] };
        grouped[resource].total += parseFloat(item.price || 0);
        grouped[resource].components.push({
          name: component || item.name,
          price: parseFloat(item.price || 0),
          quantity: parseFloat(item.quantity || 0),
          measured_unit: item.measured_unit,
        });
      }
      resources = Object.values(grouped).sort((a, b) => b.total - a.total);
    }

    res.json({
      months,
      current: latest ? {
        year: latest.year,
        month: latest.month,
        price: parseFloat(latest.price || 0),
        resources,
      } : null,
    });
  } catch (e) {
    res.status(502).json({ detail: "Waldur error" });
  }
});

app.get("/orgs/:uuid/invoices", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  try {
    const { data } = await waldur(s.waldurToken).get("/invoices/", {
      params: { customer_uuid: req.params.uuid, page_size: 12 },
    });
    const invoices = paginated(data)
      .sort((a, b) => a.year !== b.year ? b.year - a.year : b.month - a.month)
      .map((inv) => ({
        uuid: inv.uuid,
        year: inv.year,
        month: inv.month,
        label: new Date(inv.year, inv.month - 1).toLocaleString("en", { month: "long", year: "numeric" }),
        price: parseFloat(inv.price || 0),
        tax: parseFloat(inv.tax || 0),
        total: parseFloat(inv.total || 0),
        state: inv.state,
      }));
    res.json(invoices);
  } catch {
    res.status(502).json({ detail: "Waldur error" });
  }
});

// --- Users & Roles ---
app.get("/users/search", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const q = req.query.q || "";
  try {
    const { data } = await waldur(s.waldurToken).get("/users/", { params: { query: q } });
    res.json(paginated(data).map((u) => ({ uuid: u.uuid, full_name: u.full_name ?? "", email: u.email ?? "" })));
  } catch {
    res.status(502).json({ detail: "Waldur error" });
  }
});

app.get("/roles", (_req, res) => {
  res.json([
    { name: "PROJECT.ADMIN", display_name: "Admin" },
    { name: "PROJECT.MANAGER", display_name: "Manager" },
    { name: "PROJECT.MEMBER", display_name: "Member" },
  ]);
});

// --- Security Groups ---
app.get("/tenants/:uuid/security-groups", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  try {
    const { data } = await waldur(s.waldurToken).get("/openstack-security-groups/", {
      params: { tenant_uuid: req.params.uuid },
    });
    res.json(paginated(data).map((sg) => ({
      uuid: sg.uuid,
      url: sg.url,
      name: sg.name,
      description: sg.description ?? "",
      state: sg.state,
      rules: (sg.rules || []).map((r) => ({
        id: r.id,
        direction: r.direction,
        protocol: r.protocol,
        from_port: r.from_port,
        to_port: r.to_port,
        cidr: r.cidr,
        ethertype: r.ethertype,
        description: r.description ?? "",
      })),
    })));
  } catch {
    res.status(502).json({ detail: "Waldur error" });
  }
});

app.post("/tenants/:uuid/security-groups", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const { name, description, rules } = req.body;
  try {
    const { data } = await waldur(s.waldurToken).post(
      `/openstack-tenants/${req.params.uuid}/create_security_group/`,
      { name, description: description || "", rules: rules || [] }
    );
    res.status(201).json({ uuid: data.uuid, name: data.name, state: data.state });
  } catch (e) {
    const detail = e.response?.data ? JSON.stringify(e.response.data) : "Waldur error";
    res.status(502).json({ detail });
  }
});

// Create default security groups (ssh, ping, web) for a tenant
app.post("/tenants/:uuid/security-groups/defaults", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const tenantUuid = req.params.uuid;
  const defaults = [
    {
      name: "ssh",
      description: "Allow SSH access",
      rules: [
        { direction: "ingress", protocol: "tcp", from_port: 22, to_port: 22, cidr: "0.0.0.0/0", ethertype: "IPv4" },
      ],
    },
    {
      name: "ping",
      description: "Allow ICMP ping",
      rules: [
        { direction: "ingress", protocol: "icmp", from_port: -1, to_port: -1, cidr: "0.0.0.0/0", ethertype: "IPv4" },
      ],
    },
    {
      name: "web",
      description: "Allow HTTP and HTTPS",
      rules: [
        { direction: "ingress", protocol: "tcp", from_port: 80, to_port: 80, cidr: "0.0.0.0/0", ethertype: "IPv4" },
        { direction: "ingress", protocol: "tcp", from_port: 443, to_port: 443, cidr: "0.0.0.0/0", ethertype: "IPv4" },
      ],
    },
  ];

  // Check which ones already exist
  try {
    const { data: existing } = await waldur(s.waldurToken).get("/openstack-security-groups/", {
      params: { tenant_uuid: tenantUuid },
    });
    const existingNames = new Set(paginated(existing).map((sg) => sg.name));

    const created = [];
    const skipped = [];
    for (const sg of defaults) {
      if (existingNames.has(sg.name)) {
        skipped.push(sg.name);
        continue;
      }
      try {
        await waldur(s.waldurToken).post(
          `/openstack-tenants/${tenantUuid}/create_security_group/`,
          sg
        );
        created.push(sg.name);
      } catch (e) {
        return res.status(502).json({
          detail: `Failed to create '${sg.name}': ${JSON.stringify(e.response?.data || "error")}`,
        });
      }
    }
    res.json({ created, skipped });
  } catch {
    res.status(502).json({ detail: "Waldur error" });
  }
});

// Create a custom security group in ALL tenants of a project
app.post("/projects/:uuid/security-groups", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const { name, description, rules } = req.body;
  if (!name) return res.status(400).json({ detail: "name is required" });
  try {
    const { data: tenantData } = await waldur(s.waldurToken).get("/openstack-tenants/", {
      params: { project_uuid: req.params.uuid },
    });
    const okTenants = paginated(tenantData).filter((t) => t.state === "OK");
    const results = [];
    for (const tenant of okTenants) {
      // Check if group already exists in this tenant
      const { data: existing } = await waldur(s.waldurToken).get("/openstack-security-groups/", {
        params: { tenant_uuid: tenant.uuid, name_exact: name },
      });
      if (paginated(existing).length > 0) {
        results.push({ tenant: tenant.name, skipped: true });
        continue;
      }
      try {
        await waldur(s.waldurToken).post(
          `/openstack-tenants/${tenant.uuid}/create_security_group/`,
          { name, description: description || "", rules: rules || [] }
        );
        results.push({ tenant: tenant.name, created: true });
      } catch (e) {
        results.push({ tenant: tenant.name, error: true });
      }
    }
    res.json({ results });
  } catch (e) {
    const detail = e.response?.data ? JSON.stringify(e.response.data) : "Waldur error";
    res.status(502).json({ detail });
  }
});

// Create default security groups for ALL tenants in a project
app.post("/projects/:uuid/security-groups/defaults", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  try {
    // Get all tenants for this project
    const { data: tenantData } = await waldur(s.waldurToken).get("/openstack-tenants/", {
      params: { project_uuid: req.params.uuid },
    });
    const tenants = paginated(tenantData).filter((t) => t.state === "OK");

    const results = [];
    for (const tenant of tenants) {
      // Reuse the per-tenant defaults logic
      const { data: existing } = await waldur(s.waldurToken).get("/openstack-security-groups/", {
        params: { tenant_uuid: tenant.uuid },
      });
      const existingNames = new Set(paginated(existing).map((sg) => sg.name));

      const defaults = [
        {
          name: "ssh", description: "Allow SSH access",
          rules: [{ direction: "ingress", protocol: "tcp", from_port: 22, to_port: 22, cidr: "0.0.0.0/0", ethertype: "IPv4" }],
        },
        {
          name: "ping", description: "Allow ICMP ping",
          rules: [{ direction: "ingress", protocol: "icmp", from_port: -1, to_port: -1, cidr: "0.0.0.0/0", ethertype: "IPv4" }],
        },
        {
          name: "web", description: "Allow HTTP and HTTPS",
          rules: [
            { direction: "ingress", protocol: "tcp", from_port: 80, to_port: 80, cidr: "0.0.0.0/0", ethertype: "IPv4" },
            { direction: "ingress", protocol: "tcp", from_port: 443, to_port: 443, cidr: "0.0.0.0/0", ethertype: "IPv4" },
          ],
        },
      ];

      const created = [];
      const skipped = [];
      for (const sg of defaults) {
        if (existingNames.has(sg.name)) {
          skipped.push(sg.name);
        } else {
          await waldur(s.waldurToken).post(`/openstack-tenants/${tenant.uuid}/create_security_group/`, sg);
          created.push(sg.name);
        }
      }
      results.push({ tenant: tenant.name, created, skipped });
    }
    res.json({ results });
  } catch (e) {
    const detail = e.response?.data ? JSON.stringify(e.response.data) : "Waldur error";
    res.status(502).json({ detail });
  }
});

// --- Terraform helpers: flavors and images ---

app.get("/projects/:uuid/flavors", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  try {
    const { data: tenantData } = await waldur(s.waldurToken).get("/openstack-tenants/", {
      params: { project_uuid: req.params.uuid },
    });
    const tenant = paginated(tenantData).find((t) => t.state === "OK");
    if (!tenant) return res.json([]);
    const { data } = await waldur(s.waldurToken).get("/openstack-flavors/", {
      params: { settings_uuid: tenant.service_settings_uuid, page_size: 100 },
    });
    const flavors = paginated(data).map((f) => ({
      name: f.name,
      cores: f.cores,
      ram: f.ram,       // raw value from API
      disk: f.disk,     // raw value from API
    }));
    console.log("RAW FLAVORS (first):", JSON.stringify(flavors[0], null, 2));
    res.json(flavors);
  } catch (e) {
    console.error("Flavors error:", e.response?.data || e.message);
    res.status(502).json({ detail: "Waldur error" });
  }
});

app.get("/projects/:uuid/images", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  try {
    const { data: tenantData } = await waldur(s.waldurToken).get("/openstack-tenants/", {
      params: { project_uuid: req.params.uuid },
    });
    const tenant = paginated(tenantData).find((t) => t.state === "OK");
    if (!tenant) return res.json([]);
    const { data } = await waldur(s.waldurToken).get("/openstack-images/", {
      params: { settings_uuid: tenant.service_settings_uuid, page_size: 100 },
    });
    const images = paginated(data).map((i) => ({
      name: i.name,
      min_disk: i.min_disk,   // raw value
      min_ram: i.min_ram,     // raw value
    }));
    console.log("RAW IMAGES (first):", JSON.stringify(images[0], null, 2));
    res.json(images);
  } catch (e) {
    console.error("Images error:", e.response?.data || e.message);
    res.status(502).json({ detail: "Waldur error" });
  }
});

// --- Terraform Generation ---
app.get("/projects/:uuid/generate-terraform", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const vmCount = parseInt(req.query.vm_count || "1");
  const vmPrefix = req.query.vm_prefix || "vm";
  const flavorName = req.query.flavor || "g1.small1";
  const imageName = req.query.image || "Ubuntu 24.04 x86_64";
  const volumeSize = parseInt(req.query.volume_size || "20480"); // MiB
  // Frontend sends `tenant_uuids=uuid1,uuid2` listing the tenants the user
  // ticked in the UI. Filter to those tenants in the order the user picked.
  // Falling back to "all OK tenants" only when the parameter is absent
  // preserves the legacy behaviour for any caller that does not pass it.
  const selectedTenantUuids = (req.query.tenant_uuids || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // Frontend sends `security_group_names=ssh,ping,web` listing security
  // group names the user ticked. Names are tenant-scoped, so we resolve
  // each name against the per-tenant security_groups list later.
  // When the parameter is absent, fall back to "all non-default groups
  // on the tenant" so the legacy generator output is preserved.
  const selectedSgNames = (req.query.security_group_names || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const sgFilterActive = selectedSgNames.length > 0 || req.query.security_group_names !== undefined;

  try {
    // 1. Get project info
    const { data: project } = await waldur(s.waldurToken).get(`/projects/${req.params.uuid}/`);

    // 2. Get all OK tenants in the project
    const { data: tenantData } = await waldur(s.waldurToken).get("/openstack-tenants/", {
      params: { project_uuid: req.params.uuid },
    });
    const okTenants = paginated(tenantData).filter((t) => t.state === "OK");
    if (okTenants.length === 0) {
      return res.status(400).json({ detail: "No active tenants in this project" });
    }

    // 3. Restrict to the user's selection if any was sent.
    let tenants;
    if (selectedTenantUuids.length > 0) {
      const byUuid = new Map(okTenants.map((t) => [t.uuid, t]));
      tenants = selectedTenantUuids.map((u) => byUuid.get(u)).filter(Boolean);
      if (tenants.length === 0) {
        return res.status(400).json({
          detail: "None of the selected tenants are in this project or in OK state.",
        });
      }
    } else {
      tenants = okTenants;
    }

    // 4. For each tenant, gather: offering, volume type, subnet, security groups
    const tenantInfo = [];
    for (const tenant of tenants) {
      // Instance offering for this tenant — name pattern: "Virtual machine in <tenant-name>"
      const { data: offerings } = await waldur(s.waldurToken).get("/marketplace-public-offerings/", {
        params: { type: "OpenStack.Instance", name_exact: `Virtual machine in ${tenant.name}` },
      });
      let offering = paginated(offerings)[0];
      // Fallback: try scope_uuid filter
      if (!offering) {
        const { data: off2 } = await waldur(s.waldurToken).get("/marketplace-public-offerings/", {
          params: { type: "OpenStack.Instance", scope_uuid: tenant.uuid },
        });
        offering = paginated(off2)[0];
      }
      console.log(`Tenant ${tenant.name}: offering=${offering?.name || "NOT FOUND"} (${offering?.uuid || ""})`);
      if (!offering) {
        return res.status(400).json({ detail: `No instance offering found for tenant ${tenant.name}` });
      }

      // Volume types
      const { data: vtData } = await waldur(s.waldurToken).get("/openstack-volume-types/", {
        params: { settings_uuid: tenant.service_settings_uuid },
      });
      const volumeTypes = paginated(vtData);

      // Subnets
      const { data: subnetData } = await waldur(s.waldurToken).get("/openstack-subnets/", {
        params: { tenant_uuid: tenant.uuid },
      });
      const subnets = paginated(subnetData);

      // Security groups
      const { data: sgData } = await waldur(s.waldurToken).get("/openstack-security-groups/", {
        params: { tenant_uuid: tenant.uuid },
      });
      const securityGroups = paginated(sgData);

      tenantInfo.push({
        uuid: tenant.uuid,
        name: tenant.name,
        offeringUrl: offering ? offering.url : null,
        offeringName: offering ? offering.name : null,
        volumeType: volumeTypes[0]?.url || null,
        subnet: subnets[0]?.url || null,
        securityGroups: securityGroups.map((sg) => ({ name: sg.name, url: sg.url })),
      });
    }

    // 4. Distribute VMs across tenants (max 10 per tenant)
    const assignments = [];
    let remaining = vmCount;
    for (let i = 0; i < tenantInfo.length && remaining > 0; i++) {
      const count = Math.min(remaining, 10);
      assignments.push({ tenant: tenantInfo[i], count });
      remaining -= count;
    }
    if (remaining > 0) {
      return res.status(400).json({
        detail: `Not enough tenants: need ${Math.ceil(vmCount / 10)} tenants for ${vmCount} VMs, but only ${tenants.length} exist.`,
      });
    }

    // 5. Generate terraform
    let tf = `###############################################################################
# Auto-generated Terraform configuration
# Project: ${project.name}
# VMs: ${vmCount} across ${assignments.length} tenant(s)
# Generated: ${new Date().toISOString().split("T")[0]}
###############################################################################

terraform {
  required_version = ">= 1.5"

  required_providers {
    waldur = {
      source  = "waldur/waldur"
      version = "~> 0.0.8"
    }
  }
}

provider "waldur" {
  endpoint = "${WALDUR_API.replace("/api", "")}"
  token    = var.waldur_token
}

variable "waldur_token" {
  type      = string
  sensitive = true
}

variable "ssh_key_name" {
  type    = string
  default = "rsa"
}

data "waldur_structure_project" "this" {
  filters = {
    name_exact = "${project.name}"
  }
}

data "waldur_core_ssh_public_key" "this" {
  filters = {
    name = var.ssh_key_name
  }
}

`;

    for (let ai = 0; ai < assignments.length; ai++) {
      const { tenant, count } = assignments[ai];
      const tLabel = tenantInfo.length > 1 ? `_t${ai + 1}` : "";
      const tComment = tenantInfo.length > 1 ? ` (tenant: ${tenant.name})` : "";

      tf += `# ---------------------------------------------------------------------------
# Tenant${tComment}: ${count} VM(s)
# ---------------------------------------------------------------------------

data "waldur_openstack_tenant" "tenant${tLabel}" {
  filters = {
    project_uuid = data.waldur_structure_project.this.id
    name_exact   = "${tenant.name}"
  }
}

data "waldur_openstack_flavor" "flavor${tLabel}" {
  filters = {
    name_exact  = "${flavorName}"
    tenant_uuid = data.waldur_openstack_tenant.tenant${tLabel}.id
  }
}

data "waldur_openstack_image" "image${tLabel}" {
  filters = {
    name_exact  = "${imageName}"
    tenant_uuid = data.waldur_openstack_tenant.tenant${tLabel}.id
  }
}

`;

      // Subnet data source
      tf += `data "waldur_openstack_subnet" "subnet${tLabel}" {
  filters = {
    tenant_uuid = data.waldur_openstack_tenant.tenant${tLabel}.id
  }
}

`;

      // Build security_groups block.
      // Resolution rules:
      //   - If the caller passed `security_group_names`, take exactly those
      //     groups from this tenant (matching by name).
      //   - Otherwise, include every non-default group the tenant has
      //     (legacy behaviour for callers that don't pass the param).
      // The default security group is intentionally excluded — the platform
      // attaches it at the port level automatically (via the cascade in the
      // local fixed provider), and Waldur attaches it at the instance level
      // implicitly when the order payload omits security_groups entirely.
      const sgIncluded = sgFilterActive
        ? tenant.securityGroups.filter((sg) => selectedSgNames.includes(sg.name))
        : tenant.securityGroups.filter((sg) => sg.name !== "default");
      const sgBlock = sgIncluded.length > 0
        ? `\n  security_groups = [\n${sgIncluded.map((sg) =>
            `    { url = "${sg.url}" },  # ${sg.name}`,
          ).join("\n")}\n  ]\n`
        : "";

      // Resources: instances
      for (let vi = 0; vi < count; vi++) {
        const vmNum = ai * 10 + vi + 1;
        const vmId = `${vmPrefix}_${vmNum}`;

        tf += `resource "waldur_openstack_instance" "${vmId}" {
  name    = "${vmPrefix}-${vmNum}"
  project = data.waldur_structure_project.this.url

  offering = "${tenant.offeringUrl}"

  flavor = data.waldur_openstack_flavor.flavor${tLabel}.url
  image  = data.waldur_openstack_image.image${tLabel}.url

  system_volume_size = ${volumeSize}
${tenant.volumeType ? `  system_volume_type = "${tenant.volumeType}"` : ""}

  ports = [{
    subnet = data.waldur_openstack_subnet.subnet${tLabel}.url
  }]

  floating_ips = [{
    subnet = data.waldur_openstack_subnet.subnet${tLabel}.url
  }]
${sgBlock}
  ssh_public_key = data.waldur_core_ssh_public_key.this.url
}

`;
      }
    }

    // 6. Outputs
    tf += `# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------

`;
    for (let ai = 0; ai < assignments.length; ai++) {
      const { count } = assignments[ai];
      for (let vi = 0; vi < count; vi++) {
        const vmNum = ai * 10 + vi + 1;
        const vmId = `${vmPrefix}_${vmNum}`;
        tf += `output "${vmId}_ip" {
  value = one(waldur_openstack_instance.${vmId}.floating_ips).address
}

`;
      }
    }

    res.setHeader("Content-Type", "text/plain");
    res.send(tf);
  } catch (e) {
    console.error("Generate terraform error:", e.response?.data || e.message);
    const detail = e.response?.data ? JSON.stringify(e.response.data) : e.message || "Waldur error";
    res.status(502).json({ detail });
  }
});

app.get("/debug/plan", async (req, res) => {
  const s = getSession(req, res);
  if (!s) return;
  const { url } = req.query;
  try {
    const { data } = await axios.get(url, { headers: { Authorization: `Token ${s.waldurToken}` } });
    res.json(data);
  } catch (e) {
    res.status(502).json({ detail: e.response?.data || "error" });
  }
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
