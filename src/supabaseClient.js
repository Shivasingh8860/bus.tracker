import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://skwlqegbshztbektujxl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNrd2xxZWdic2h6dGJla3R1anhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5OTM2NDgsImV4cCI6MjA4NzU2OTY0OH0.CIdFtl5U6X81u7n9OoAWfnmz-TOxRMWnBB2eMRSf-g0';

export const supabase = createClient(supabaseUrl, supabaseKey);
