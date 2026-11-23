function normalize(value: string) {
 return value.trim().toLocaleLowerCase('es-AR').normalize('NFD').replace(/\p{M}/gu, '');
}

export function matchesHistorySearch(query: string, ...fields: string[]) {
 const term = normalize(query);
 return !term || fields.some(field => normalize(field).includes(term));
}
