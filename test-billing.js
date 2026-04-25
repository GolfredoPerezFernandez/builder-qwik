const computeBillableDays24h = (dateFrom, timeFrom, dateTo, timeTo) => {
  if (!dateFrom || !dateTo) return 0;
  const start = new Date(`${dateFrom}T${timeFrom || '12:00'}:00`);
  const end = new Date(`${dateTo}T${timeTo || '12:00'}:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;

  const durationMs = end.getTime() - start.getTime();
  if (durationMs <= 0) return 1;

  return Math.max(1, Math.ceil(durationMs / (1000 * 60 * 60 * 24)));
};

const toUtcEpochDay = (dateValue) => {
  const [yearRaw, monthRaw, dayRaw] = dateValue.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!year || !month || !day) return Number.NaN;
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
};

const getBillableDaysForCurrentSelection = (
  selectedBookingDates,
  serviceDraft,
  bookingDayTimes,
) => {
  const selectedDays = Array.from(new Set(selectedBookingDates)).sort();
  if (selectedDays.length === 0) {
    // Falls back to simple range if no days selected
    return computeBillableDays24h(serviceDraft.dateFrom, serviceDraft.timeFrom, serviceDraft.dateTo, serviceDraft.timeTo);
  }

  const selectedEpochDays = selectedDays.map((value) => toUtcEpochDay(value));
  const segments = [];

  for (let index = 0; index < selectedEpochDays.length; index++) {
    if (index === 0 || selectedEpochDays[index] !== selectedEpochDays[index - 1] + 1) {
      segments.push([selectedDays[index]]);
    } else {
      segments[segments.length - 1].push(selectedDays[index]);
    }
  }

  let totalBillableDays = 0;

  for (const segment of segments) {
    const startDay = segment[0];
    const endDay = segment[segment.length - 1];

    const timeFrom = bookingDayTimes[startDay]?.timeFrom || serviceDraft.timeFrom || '12:00';
    const timeTo = bookingDayTimes[endDay]?.timeTo || serviceDraft.timeTo || '12:00';

    let effectiveEndDate = endDay;
    if (startDay === endDay && timeTo <= timeFrom) {
      const rollover = new Date(`${endDay}T00:00:00`);
      rollover.setDate(rollover.getDate() + 1);
      effectiveEndDate = `${rollover.getFullYear()}-${String(rollover.getMonth() + 1).padStart(2, '0')}-${String(rollover.getDate()).padStart(2, '0')}`;
    }

    const segmentDays = computeBillableDays24h(
      startDay,
      timeFrom,
      effectiveEndDate,
      timeTo,
    );
    console.log({ segment, startDay, endDay, timeFrom, timeTo, effectiveEndDate, segmentDays });

    totalBillableDays += segmentDays;
  }

  return totalBillableDays;
};

const res = getBillableDaysForCurrentSelection(
  ["2026-02-19", "2026-02-20", "2026-02-27"],
  { timeFrom: '12:00', timeTo: '11:30' },
  { 
    "2026-02-19": { timeFrom: "12:00", timeTo: "12:00" }, // wait, timeTo is taken from endDay
    "2026-02-20": { timeFrom: "12:00", timeTo: "11:30" },
    "2026-02-27": { timeFrom: "11:25", timeTo: "11:30" }
  }
);
console.log("TOTAL:", res);
