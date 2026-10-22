import { handleAround, jsonResponse } from '../../../day-074-link-dokumi/lib/handlers.js';

export const onRequestGet = context => handleAround(context.request, {
  env:context.env, fetchImpl:fetch, cache:globalThis.caches?.default ?? null,
  now:() => Date.now(), waitUntil:context.waitUntil?.bind(context),
  selfHosts:[new URL(context.request.url).hostname]
});
// onRequestも登録するとGETの前に呼ばれるため、GETは同じ入口へ渡す。
export const onRequest = context => context.request.method === 'GET'
  ? onRequestGet(context)
  : jsonResponse({error:'method_not_allowed'},405,{Allow:'GET'});
