package router

import (
	"markdown/backend/handler"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func NewRouter(db *gorm.DB) *gin.Engine {
	r := gin.Default()
	noteHandler := handler.NewNoteHandler(db)
	note := r.Group("/api/notes")
	{
		note.POST("", noteHandler.Save)
		note.GET("", noteHandler.List)
		note.GET("/:id", noteHandler.ListOne)
		note.POST("/:id/check", noteHandler.Check)
		note.GET("/:id/render", noteHandler.Render)
	}
	return r
}
