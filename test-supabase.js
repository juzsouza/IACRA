import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ldumzwrwbhjtrnlioigg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkdW16d3J3YmhqdHJubGlvaWdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNTU0MDcsImV4cCI6MjA4ODYzMTQwN30.PgzhWMBsYifm6ADnYm-EQu83DK9BShDQAVZlQw5sayU';

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  console.log('Testing Supabase connection...');
  const tables = [
    'students',
    'teachers',
    'classes',
    'transactions',
    'financial_plans',
    'enrollments',
    'groups',
    'financial_discount_rules',
    'choir_voice_types',
    'choir_registrations',
    'prospects',
    'profiles'
  ];
  for (const table of tables) {
    const { data, count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
    if (error) {
      console.error(`Error querying ${table}:`, error.message);
    } else {
      console.log(`Table ${table}: ${count} rows`);
    }
  }
}

test();
