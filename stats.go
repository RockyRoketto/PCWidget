package main

// Stats — один снимок показателей, который раз в секунду уходит в страницу как JSON.
// Недоступное значение = nil (поле пропадает), страница такие поля не показывает.
type Stats struct {
	TS      int64        `json:"ts"`
	CPU     *CPUStat     `json:"cpu,omitempty"`
	GPU     *GPUStat     `json:"gpu,omitempty"`
	Mem     *MemStat     `json:"mem,omitempty"`
	Net     *NetStat     `json:"net,omitempty"`
	Disks   []DiskStat   `json:"disks,omitempty"`
	Procs   *ProcStat    `json:"procs,omitempty"`
	Weather *WeatherStat `json:"weather,omitempty"`
	// WeatherState: "" (выключена), loading, ok, notfound, error — для подсказки у поля города.
	WeatherState string      `json:"weatherState,omitempty"`
	Claude       *ClaudeStat `json:"claude,omitempty"`
	Energy       *EnergyStat `json:"energy,omitempty"`
	Uptime       int64       `json:"uptime"` // секунды с запуска системы
	Idle         int64       `json:"idle"`   // секунды без мыши и клавиатуры
	// Frames — кадры игры на переднем плане (только в игровом режиме).
	Frames *FrameStat `json:"frames,omitempty"`
}

type CPUStat struct {
	Load  float64  `json:"load"` // %
	Temp  *float64 `json:"temp,omitempty"`
	Freq  *float64 `json:"freq,omitempty"`  // МГц
	Power *float64 `json:"power,omitempty"` // Вт
	// Cores — загрузка каждого потока в %, группы процессоров подряд.
	Cores []float64 `json:"cores,omitempty"`
}

type GPUStat struct {
	Name     string   `json:"name"`
	Load     float64  `json:"load"`
	Temp     *float64 `json:"temp,omitempty"`
	MemUsed  *float64 `json:"memUsed,omitempty"`  // МБ
	MemTotal *float64 `json:"memTotal,omitempty"` // МБ
	Power    *float64 `json:"power,omitempty"`
	Fan      *float64 `json:"fan,omitempty"` // %
	Clock    *float64 `json:"clock,omitempty"`
}

type MemStat struct {
	UsedGB      float64  `json:"usedGB"`
	TotalGB     float64  `json:"totalGB"`
	Pct         float64  `json:"pct"`
	PageUsedGB  *float64 `json:"pageUsedGB,omitempty"`
	PageTotalGB *float64 `json:"pageTotalGB,omitempty"`
}

type NetStat struct {
	Down      float64  `json:"down"` // байт/с
	Up        float64  `json:"up"`
	Ping      *float64 `json:"ping,omitempty"` // мс
	Loss      *float64 `json:"loss,omitempty"` // % потерь за последние замеры
	DayDown   uint64   `json:"dayDown"`
	DayUp     uint64   `json:"dayUp"`
	MonthDown uint64   `json:"monthDown"`
	MonthUp   uint64   `json:"monthUp"`
}

type DiskStat struct {
	Name    string   `json:"name"` // "C:"
	TotalGB float64  `json:"totalGB"`
	FreeGB  float64  `json:"freeGB"`
	UsedPct float64  `json:"usedPct"`
	Read    *float64 `json:"read,omitempty"`  // байт/с
	Write   *float64 `json:"write,omitempty"` // байт/с
	Busy    *float64 `json:"busy,omitempty"`  // %
	Temp    *float64 `json:"temp,omitempty"`
}

type ProcItem struct {
	Name string  `json:"name"`
	V    float64 `json:"v"` // CPU: %, RAM: МБ, диск: байт/с
}

type ProcStat struct {
	CPU  []ProcItem `json:"cpu"`
	RAM  []ProcItem `json:"ram"`
	Disk []ProcItem `json:"disk"`
	// Map — частная память процессов в МБ для карты в плитке «Память», список длиннее остальных.
	Map []ProcItem `json:"map"`
}

func ptr(v float64) *float64 { return &v }
