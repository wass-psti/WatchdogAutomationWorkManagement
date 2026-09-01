import type { BoardRepository } from './repository.ts';
export interface BoardDomainService extends BoardRepository {}
export interface BoardDomainServiceDependencies { readonly repository: BoardRepository; }
