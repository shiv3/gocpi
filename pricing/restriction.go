package pricing

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

const restrictionDateLayout = "2006-01-02"

func matches(r *Restrictions, start snapshot, p Period) (ok bool, unsupported bool) {
	if r == nil {
		return true, false
	}
	if len(r.Unsupported) > 0 {
		return false, true
	}

	local := start.localTime()
	localMinute := local.Hour()*60 + local.Minute()
	if !matchesTimeWindow(r.StartTime, r.EndTime, localMinute) {
		return false, false
	}

	localDate := truncateLocalDate(start)
	if r.StartDate != nil {
		startDate, err := time.ParseInLocation(restrictionDateLayout, *r.StartDate, start.loc)
		if err != nil || localDate.Before(startDate) {
			return false, false
		}
	}
	if r.EndDate != nil {
		endDate, err := time.ParseInLocation(restrictionDateLayout, *r.EndDate, start.loc)
		if err != nil || !localDate.Before(endDate) {
			return false, false
		}
	}

	if len(r.DayOfWeek) > 0 && !containsWeekday(r.DayOfWeek, start.localWeekday()) {
		return false, false
	}
	if r.MinKwh != nil && start.energy.LessThan(*r.MinKwh) {
		return false, false
	}
	if r.MaxKwh != nil && !start.energy.LessThan(*r.MaxKwh) {
		return false, false
	}
	if r.MinDuration != nil && start.durSession < *r.MinDuration {
		return false, false
	}
	if r.MaxDuration != nil && start.durSession >= *r.MaxDuration {
		return false, false
	}

	if r.MinPower != nil && p.MaxPower != nil && p.MaxPower.LessThan(*r.MinPower) {
		return false, false
	}
	if r.MaxPower != nil && p.MinPower != nil && !p.MinPower.LessThan(*r.MaxPower) {
		return false, false
	}
	if r.MinCurrent != nil && p.MaxCurrent != nil && p.MaxCurrent.LessThan(*r.MinCurrent) {
		return false, false
	}
	if r.MaxCurrent != nil && p.MinCurrent != nil && !p.MinCurrent.LessThan(*r.MaxCurrent) {
		return false, false
	}

	return true, false
}

func validateRestrictionStrings(r *Restrictions) error {
	if r == nil {
		return nil
	}
	if err := validateRestrictionTime("start_time", r.StartTime); err != nil {
		return err
	}
	if err := validateRestrictionTime("end_time", r.EndTime); err != nil {
		return err
	}
	if err := validateRestrictionDate("start_date", r.StartDate); err != nil {
		return err
	}
	if err := validateRestrictionDate("end_date", r.EndDate); err != nil {
		return err
	}
	return nil
}

func validateRestrictionTime(field string, value *string) error {
	if value == nil {
		return nil
	}
	if _, err := parseMinuteOfDay(*value); err != nil {
		return &PricingError{Code: InvalidInput, Msg: fmt.Sprintf("invalid %s %q: expected HH:MM", field, *value)}
	}
	return nil
}

func validateRestrictionDate(field string, value *string) error {
	if value == nil {
		return nil
	}
	if _, err := time.Parse(restrictionDateLayout, *value); err != nil {
		return &PricingError{Code: InvalidInput, Msg: fmt.Sprintf("invalid %s %q: expected YYYY-MM-DD", field, *value)}
	}
	return nil
}

func matchesTimeWindow(startTime, endTime *string, localMinute int) bool {
	startMinute, hasStart, startOK := optionalMinuteOfDay(startTime)
	if !startOK {
		return false
	}
	endMinute, hasEnd, endOK := optionalMinuteOfDay(endTime)
	if !endOK {
		return false
	}

	switch {
	case hasStart && hasEnd && endMinute < startMinute:
		return localMinute >= startMinute || localMinute < endMinute
	case hasStart && hasEnd:
		return localMinute >= startMinute && localMinute < endMinute
	case hasStart:
		return localMinute >= startMinute
	case hasEnd:
		return localMinute < endMinute
	default:
		return true
	}
}

func optionalMinuteOfDay(value *string) (minute int, ok bool, valid bool) {
	if value == nil {
		return 0, false, true
	}
	minute, err := parseMinuteOfDay(*value)
	return minute, true, err == nil
}

func parseMinuteOfDay(value string) (int, error) {
	if len(value) != len("00:00") {
		return 0, fmt.Errorf("invalid time %q", value)
	}

	hourText, minuteText, found := strings.Cut(value, ":")
	if !found || len(hourText) != 2 || len(minuteText) != 2 {
		return 0, fmt.Errorf("invalid time %q", value)
	}
	if !isTwoDigits(hourText) || !isTwoDigits(minuteText) {
		return 0, fmt.Errorf("invalid time %q", value)
	}
	hour, err := strconv.Atoi(hourText)
	if err != nil {
		return 0, fmt.Errorf("invalid hour %q", hourText)
	}
	minute, err := strconv.Atoi(minuteText)
	if err != nil {
		return 0, fmt.Errorf("invalid minute %q", minuteText)
	}
	if hour < 0 || hour > 23 || minute < 0 || minute > 59 {
		return 0, fmt.Errorf("time %q out of range", value)
	}
	return hour*60 + minute, nil
}

func isTwoDigits(value string) bool {
	return len(value) == 2 && value[0] >= '0' && value[0] <= '9' && value[1] >= '0' && value[1] <= '9'
}

func truncateLocalDate(s snapshot) time.Time {
	local := s.localDate()
	y, m, d := local.Date()
	return time.Date(y, m, d, 0, 0, 0, 0, s.loc)
}

func containsWeekday(days []time.Weekday, want time.Weekday) bool {
	for _, day := range days {
		if day == want {
			return true
		}
	}
	return false
}
