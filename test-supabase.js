import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ldumzwrwbhjtrnlioigg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkdW16d3J3YmhqdHJubGlvaWdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNTU0MDcsImV4cCI6MjA4ODYzMTQwN30.PgzhWMBsYifm6ADnYm-EQu83DK9BShDQAVZlQw5sayU';

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  console.log('Testing Supabase connection...');
  const { data, error } = await supabase.from('students').select('*').limit(1);
  if (error) {
    console.error('Error connecting to Supabase:', error.message);
  } else {
    console.log('Supabase is responding! Data:', data);
  }
}

test();
