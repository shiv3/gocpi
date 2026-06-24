package pricing

import (
	"time"

	"github.com/shopspring/decimal"
)

type snapshot struct {
	at          time.Time
	loc         *time.Location
	energy      decimal.Decimal
	durCharging time.Duration
	durSession  time.Duration
}

func newSnapshot(start time.Time, loc *time.Location) snapshot {
	return snapshot{at: start, loc: loc, energy: decimal.Zero}
}

func hoursToDuration(h decimal.Decimal) time.Duration {
	secs := h.Mul(decimal.NewFromInt(3600))
	whole := secs.IntPart()
	frac := secs.Sub(decimal.NewFromInt(whole)).Mul(decimal.NewFromInt(1e9)).IntPart()
	return time.Duration(whole)*time.Second + time.Duration(frac)*time.Nanosecond
}

func (s snapshot) next(p Period, end time.Time) snapshot {
	out := s
	out.at = end
	out.durSession = s.durSession + end.Sub(s.at)
	if p.Energy != nil {
		out.energy = s.energy.Add(*p.Energy)
	}
	if p.Time != nil {
		out.durCharging = s.durCharging + hoursToDuration(*p.Time)
	}
	return out
}

func (s snapshot) localTime() time.Time {
	return s.at.In(s.loc)
}

func (s snapshot) localDate() time.Time {
	return s.at.In(s.loc)
}

func (s snapshot) localWeekday() time.Weekday {
	return s.at.In(s.loc).Weekday()
}
