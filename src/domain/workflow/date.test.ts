import {expect,it} from 'vitest';
import {formatDay,seasonAt,yearAt} from './date';
it('rolls 28-day seasons and 112-day years without a zero day',()=>{
 expect([seasonAt(28),seasonAt(29),seasonAt(112),seasonAt(113)]).toEqual(['spring','summer','winter','spring']);
 expect(yearAt(113)).toBe(2);expect(formatDay(5)).toBe('第1年 春5日');expect(formatDay(113)).toBe('第2年 春1日');
});
