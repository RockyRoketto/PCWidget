package main

import "time"

// Когда проверять обновления (без сети и WinAPI).

const (
	updateFirst = 10 * time.Second // после запуска
	updateEvery = time.Hour
	updateNudge = 5 * time.Minute // не чаще этого по поводу открытия настроек
)

// updateRetry — паузы после неудач подряд: при входе в Windows сеть часто ещё не готова.
var updateRetry = []time.Duration{30 * time.Second, time.Minute, 2 * time.Minute, 5 * time.Minute, 15 * time.Minute}

// updateWait — сколько ждать после проверки; fails — число неудач подряд.
func updateWait(fails int) time.Duration {
	if fails > 0 && fails <= len(updateRetry) {
		return updateRetry[fails-1]
	}
	return updateEvery
}

// updateDue сравнивает по настенным часам: монотонные не считают время сна ПК.
// Часы перевели назад — тоже пора, иначе проверка встала бы надолго.
func updateDue(now, last time.Time, wait time.Duration) bool {
	d := now.Round(0).Sub(last.Round(0))
	return d < 0 || d >= wait
}
