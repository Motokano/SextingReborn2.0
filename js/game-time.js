/**
 * 游戏时间系统
 * 约定：
 * - 1 tick = 10 分钟
 * - 24 小时制
 * - 360 天 = 1 年
 * - 显示格式：第X年 第Y天 HH:MM
 *
 * 提供时间段（早上/中午/下午/晚上）与时间判断接口，供其他系统调用。
 */
(function (global) {
    'use strict';

    var MINUTES_PER_TICK = 10;
    var MINUTES_PER_DAY = 24 * 60;
    var DAYS_PER_YEAR = 360;

    // 以“总 tick 数”作为唯一真源，便于存档与回放。
    // 开局默认从早上 09:00 开始（第1年 第1天）。
    var state = {
        totalTicks: Math.floor((9 * 60) / MINUTES_PER_TICK)
    };

    function clampInt(v, min, max) {
        v = Math.floor(Number(v) || 0);
        if (v < min) return min;
        if (v > max) return max;
        return v;
    }

    function pad2(n) {
        n = Math.floor(Number(n) || 0);
        return (n < 10 ? '0' : '') + String(n);
    }

    function getTotalMinutes() {
        return state.totalTicks * MINUTES_PER_TICK;
    }

    function getTotalDays() {
        return Math.floor(getTotalMinutes() / MINUTES_PER_DAY);
    }

    function getMinuteOfDay() {
        var m = getTotalMinutes() % MINUTES_PER_DAY;
        if (m < 0) m += MINUTES_PER_DAY;
        return m;
    }

    function getHour() {
        return Math.floor(getMinuteOfDay() / 60);
    }

    function getMinute() {
        return Math.floor(getMinuteOfDay() % 60);
    }

    function getDayOfYear() {
        // 1-based
        var day = (getTotalDays() % DAYS_PER_YEAR);
        if (day < 0) day += DAYS_PER_YEAR;
        return day + 1;
    }

    function getYear() {
        // 1-based
        var y = Math.floor(getTotalDays() / DAYS_PER_YEAR);
        return y + 1;
    }

    function isTimeBetweenMinutes(minOfDay, startMin, endMin) {
        // 半开区间 [start, end)，支持跨午夜
        minOfDay = clampInt(minOfDay, 0, MINUTES_PER_DAY - 1);
        startMin = clampInt(startMin, 0, MINUTES_PER_DAY);
        endMin = clampInt(endMin, 0, MINUTES_PER_DAY);
        if (startMin === endMin) return true;
        if (startMin < endMin) return minOfDay >= startMin && minOfDay < endMin;
        return (minOfDay >= startMin) || (minOfDay < endMin);
    }

    function getTimePeriod() {
        // 早上 / 中午 / 下午 / 晚上（覆盖 24h）
        // 早上：06:00-12:00；中午：12:00-14:00；下午：14:00-18:00；晚上：18:00-06:00
        var m = getMinuteOfDay();
        if (isTimeBetweenMinutes(m, 6 * 60, 12 * 60)) return 'morning';
        if (isTimeBetweenMinutes(m, 12 * 60, 14 * 60)) return 'noon';
        if (isTimeBetweenMinutes(m, 14 * 60, 18 * 60)) return 'afternoon';
        return 'evening';
    }

    function getTimePeriodLabel() {
        var p = getTimePeriod();
        if (p === 'morning') return '早上';
        if (p === 'noon') return '中午';
        if (p === 'afternoon') return '下午';
        return '晚上';
    }

    function getDisplayString() {
        return '第' + getYear() + '年 第' + getDayOfYear() + '天 ' + pad2(getHour()) + ':' + pad2(getMinute());
    }

    function advanceTicks(ticks) {
        var t = Math.floor(Number(ticks) || 0);
        if (!t) return;
        state.totalTicks += t;
        if (state.totalTicks < 0) state.totalTicks = 0;
    }

    function reset(options) {
        options = options || {};
        // 支持：从指定年/天/时/分初始化
        if (options.totalTicks !== undefined) {
            state.totalTicks = Math.max(0, Math.floor(Number(options.totalTicks) || 0));
            return;
        }
        var year = (options.year !== undefined) ? Math.max(1, Math.floor(Number(options.year) || 1)) : 1;
        var day = (options.day !== undefined) ? clampInt(options.day, 1, DAYS_PER_YEAR) : 1;
        var hour = clampInt(options.hour !== undefined ? options.hour : 9, 0, 23);
        var minute = clampInt(options.minute !== undefined ? options.minute : 0, 0, 59);
        var totalDays = (year - 1) * DAYS_PER_YEAR + (day - 1);
        var totalMinutes = totalDays * MINUTES_PER_DAY + hour * 60 + minute;
        state.totalTicks = Math.floor(totalMinutes / MINUTES_PER_TICK);
        if (state.totalTicks < 0) state.totalTicks = 0;
    }

    function getState() {
        return {
            totalTicks: state.totalTicks,
            minutesPerTick: MINUTES_PER_TICK,
            daysPerYear: DAYS_PER_YEAR,
            year: getYear(),
            dayOfYear: getDayOfYear(),
            hour: getHour(),
            minute: getMinute(),
            minuteOfDay: getMinuteOfDay(),
            timePeriod: getTimePeriod(),
            timePeriodLabel: getTimePeriodLabel(),
            display: getDisplayString()
        };
    }

    // 预留：便于其他模块做时间判断
    function isMorning() { return getTimePeriod() === 'morning'; }
    function isNoon() { return getTimePeriod() === 'noon'; }
    function isAfternoon() { return getTimePeriod() === 'afternoon'; }
    function isEvening() { return getTimePeriod() === 'evening'; }
    function isTimeBetween(hh1, mm1, hh2, mm2) {
        var start = clampInt(hh1, 0, 23) * 60 + clampInt(mm1, 0, 59);
        var end = clampInt(hh2, 0, 23) * 60 + clampInt(mm2, 0, 59);
        return isTimeBetweenMinutes(getMinuteOfDay(), start, end);
    }

    global.GameTime = {
        // 常量
        MINUTES_PER_TICK: MINUTES_PER_TICK,
        MINUTES_PER_DAY: MINUTES_PER_DAY,
        DAYS_PER_YEAR: DAYS_PER_YEAR,

        // 状态/推进
        getState: getState,
        reset: reset,
        advanceTicks: advanceTicks,

        // 展示
        getDisplayString: getDisplayString,
        getTimePeriod: getTimePeriod,
        getTimePeriodLabel: getTimePeriodLabel,

        // 判断接口（给其他系统调用）
        isMorning: isMorning,
        isNoon: isNoon,
        isAfternoon: isAfternoon,
        isEvening: isEvening,
        isTimeBetween: isTimeBetween
    };
})(typeof window !== 'undefined' ? window : this);

