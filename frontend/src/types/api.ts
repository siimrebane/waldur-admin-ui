export interface UserInfo {
  user_uuid: string;
  full_name: string;
  email: string;
}

export interface OrgSummary {
  uuid: string;
  name: string;
  projects_count: number;
}

export interface OrgDetail {
  uuid: string;
  name: string;
  description: string;
  projects_count: number;
}

export interface ProjectSummary {
  uuid: string;
  name: string;
  description: string;
}

export interface MemberInfo {
  user_uuid: string;
  full_name: string;
  email: string;
  role: string;
}

export interface UserSearchResult {
  uuid: string;
  full_name: string;
  email: string;
}

export interface RoleInfo {
  name: string;
  display_name: string;
}

// Costs
export interface CostMonth {
  year: number;
  month: number;
  label: string;
  price: number;
}

export interface CostComponent {
  name: string;
  price: number;
  quantity: number;
  measured_unit: string;
}

export interface CostResource {
  name: string;
  total: number;
  components: CostComponent[];
}

export interface ProjectCosts {
  months: CostMonth[];
  current: {
    year: number;
    month: number;
    price: number;
    resources: CostResource[];
  } | null;
}

export interface InvoiceSummary {
  uuid: string;
  year: number;
  month: number;
  label: string;
  price: number;
  tax: number;
  total: number;
  state: string;
}
