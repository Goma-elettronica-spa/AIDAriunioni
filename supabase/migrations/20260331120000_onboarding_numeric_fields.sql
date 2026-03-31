-- Replace text range columns with numeric values for employees and revenue
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS employee_count integer;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS revenue_millions numeric(10,2);
