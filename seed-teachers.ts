import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ldumzwrwbhjtrnlioigg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkdW16d3J3YmhqdHJubGlvaWdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNTU0MDcsImV4cCI6MjA4ODYzMTQwN30.PgzhWMBsYifm6ADnYm-EQu83DK9BShDQAVZlQw5sayU';

const supabase = createClient(supabaseUrl, supabaseKey);

const teachers = [
  { name: "Abigail", specialties: ["Técnica vocal adulta"] },
  { name: "Camila Eugênia", specialties: ["Técnica vocal infantil", "Técnica vocal adulta"] },
  { name: "Rafaela Cintra", specialties: ["Técnica vocal"] },
  { name: "Daniel", specialties: ["Violão"] },
  { name: "Esdras", specialties: ["Violão"] },
  { name: "Rafael Laursen", specialties: ["Violão"] },
  { name: "Erick", specialties: ["Teclado"] },
  { name: "Jean", specialties: ["Teclado"] },
  { name: "Ewerton", specialties: ["Contrabaixo"] },
  { name: "Kayenne", specialties: ["Fonoaudiologia"] },
  { name: "Monique", specialties: ["Musicalização infantil", "Técnica vocal infantil", "Técnica vocal adulta", "Teclado"] },
  { name: "Priscila", specialties: ["Musicalização infantil", "Técnica vocal infantil", "Técnica vocal adulta", "Teclado"] },
  { name: "Alan", specialties: ["Bateria"] },
  { name: "Nathália Rizzo", specialties: ["Violino"] }
];

const generateId = () => crypto.randomUUID();

async function seed() {
  console.log('Fetching existing teachers...');
  const { data: existing, error: fetchError } = await supabase.from('teachers').select('name');
  
  if (fetchError) {
    console.error('Error fetching existing teachers:', fetchError);
    return;
  }

  const existingNames = new Set(existing?.map(t => t.name) || []);
  
  const toInsert = teachers
    .filter(t => !existingNames.has(t.name))
    .map(t => ({
      id: generateId(),
      name: t.name,
      email: "pro@gmail.com",
      phone: "18999999999",
      specialties: t.specialties
    }));

  if (toInsert.length === 0) {
    console.log('All teachers already exist.');
    return;
  }

  console.log(`Inserting ${toInsert.length} new teachers...`);
  const { error: insertError } = await supabase.from('teachers').insert(toInsert);
  
  if (insertError) {
    console.error('Error inserting teachers:', insertError);
  } else {
    console.log('Successfully inserted teachers!');
  }
}

seed();
