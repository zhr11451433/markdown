package handler

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"markdown/backend/database"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/microcosm-cc/bluemonday"
	"github.com/yuin/goldmark"
	"gorm.io/gorm"
)

// 1. 检查语法	POST /api/notes/:id/check
// 4. 返回 HTML 渲染版	GET /api/notes/:id/render
const languageToolURL = "https://api.languagetool.org/v2/check"

type NoteHandler struct {
	db     *gorm.DB
	md     goldmark.Markdown  //转换器 建一次
	policy *bluemonday.Policy //过滤器 建一次
	client *http.Client
}

func NewNoteHandler(db *gorm.DB) *NoteHandler {
	return &NoteHandler{
		db:     db,
		md:     goldmark.New(),
		policy: bluemonday.UGCPolicy(),
		client: &http.Client{Timeout: 10 * time.Second},
	}
}

type Match struct {
	Offset       int           `json:"offset"`
	Length       int           `json:"length"`
	Message      string        `json:"message"`
	Replacements []Replacement `json:"replacements"`
}
type Replacement struct {
	Value string `json:"value"`
}

// LanguageTool 完整响应

type LanguageToolResponse struct {
	Matches []Match `json:"matches"`
}
type noteRequest struct {
	Title   string `json:"title" binding:"required"`
	Content string `json:"content"`
}

func (u *NoteHandler) Save(c *gin.Context) {
	var noteRequest noteRequest
	if err := c.ShouldBindJSON(&noteRequest); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	note := database.Note{
		Title:   noteRequest.Title,
		Content: noteRequest.Content,
	}
	if err := u.db.Create(&note).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{
		"status": "创建成功",
		"id":     note.ID,
		"title":  note.Title,
	})
}

//列出所有笔记

func (u *NoteHandler) List(c *gin.Context) {
	listNote := make([]database.Note, 0)
	if err := u.db.Find(&listNote).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "数据库错误"})
		return
	}
	c.JSON(http.StatusOK, listNote)
}

//列出某一个笔记 :id url /api/notes/:id

func (u *NoteHandler) ListOne(c *gin.Context) {
	var listNote database.Note
	id, err := Id(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "id错误"})
		return
	}
	if err := u.db.Where("id = ?", id).First(&listNote).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "笔记不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "数据库错误"})
		return
	}
	//找到了
	c.JSON(http.StatusOK, listNote)
}

func (u *NoteHandler) Render(c *gin.Context) {
	id, err := Id(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "id错误"})
		return
	}
	var note database.Note
	if err := u.db.Where("id = ?", id).First(&note).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "笔记不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "数据库错误"})
		return
	}
	content := note.Content
	buf := bytes.Buffer{}
	//得到 HTML 字符串
	if err := u.md.Convert([]byte(content), &buf); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	//过滤掉危险标签
	safeHTML := u.policy.SanitizeBytes(buf.Bytes())
	c.JSON(http.StatusOK, gin.H{
		"id":   note.ID,
		"html": string(safeHTML),
	})
}

func (u *NoteHandler) Check(c *gin.Context) {
	id, err := Id(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "id错误"})
		return
	}
	var note database.Note
	if err := u.db.Where("id = ?", id).First(&note).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "笔记不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "数据库错误"})
		return
	}
	content := note.Content

	data := url.Values{}
	data.Set("text", content)
	data.Set("language", "auto")
	resp, err := u.client.PostForm(languageToolURL, data)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		c.JSON(http.StatusBadGateway, gin.H{"error": "语法检查暂不可用"})
		return
	}
	var mistake LanguageToolResponse
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	err = json.Unmarshal(body, &mistake)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, mistake)
}

func Id(c *gin.Context) (uint, error) {
	idString := c.Param("id")
	uid, err := strconv.ParseUint(idString, 10, 64)
	if err != nil {
		return 0, err
	}
	return uint(uid), nil
}
