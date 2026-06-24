package pricing

type componentSet struct {
	energy, time, parking, flat *PriceComponent
}

func (c componentSet) complete() bool {
	return c.energy != nil && c.time != nil && c.parking != nil && c.flat != nil
}

func activeComponents(tariff Tariff, start snapshot, p Period) (componentSet, []Warning) {
	var cs componentSet
	var warns []Warning

	for i := range tariff.Elements {
		el := &tariff.Elements[i]
		ok, unsupported := matches(el.Restrictions, start, p)
		if unsupported {
			warns = append(warns, Warning{
				Code: WarnUnsupportedRestriction,
				Kind: KindWarning,
				Msg:  "element skipped: unsupported restriction",
			})
		}
		if !ok {
			continue
		}

		for j := range el.Components {
			comp := &el.Components[j]
			switch comp.Type {
			case Energy:
				if cs.energy == nil {
					cs.energy = comp
				}
			case Time:
				if cs.time == nil {
					cs.time = comp
				}
			case ParkingTime:
				if cs.parking == nil {
					cs.parking = comp
				}
			case Flat:
				if cs.flat == nil {
					cs.flat = comp
				}
			}
		}
		if cs.complete() {
			break
		}
	}

	return cs, warns
}
