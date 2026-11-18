/** CPF do aluno e do responsavel sao identidades diferentes. */
export function onlyCpfDigits(value:string):string {
  return value.replace(/\D/g,'');
}
export function sameStudentGuardianCpf(studentCpf:string,guardianCpf:string):boolean {
  const a=onlyCpfDigits(studentCpf), b=onlyCpfDigits(guardianCpf);
  return a.length===11 && b.length===11 && a===b;
}
export function validateMinorGuardianCpf(isMinor:boolean,studentCpf:string,guardianCpf:string):string|null {
  if(!isMinor)return null;
  const g=onlyCpfDigits(guardianCpf);
  if(g.length!==11)return 'Informe o CPF do responsável legal com 11 números.';
  if(sameStudentGuardianCpf(studentCpf,guardianCpf))
    return 'O CPF do responsável não pode ser igual ao CPF do aluno. Informe o CPF de cada pessoa.';
  return null;
}
