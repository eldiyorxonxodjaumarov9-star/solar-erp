import { createGroupAttendanceNotifier } from '../telegram/groupAttendanceDelivery.js';
import { createTelegramLinkRouter } from './telegramLinkApi.js';
import { createTelegramAttendanceHandler } from '../telegram/attendance.js';
export function createTelegramAttendanceRouter(options = {}) {
  const handler=options.handleUpdate || createTelegramAttendanceHandler(options);
  const notifyGroup=options.notifyGroup || createGroupAttendanceNotifier(options);
  return createTelegramLinkRouter({...options,handleUpdate:async(db,update)=>{
    const result=await handler(db,update);
    if(result.groupRequestToken){try{await notifyGroup(String(update.message.from.id),'',{db,requestToken:result.groupRequestToken,action:'day_off'});}catch{/* Pending receipt safely retries; attendance remains committed. */}}
    return result;
  }});
}
